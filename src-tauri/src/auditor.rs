use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

const MAX_PROPOSALS: usize = 100;
const MAX_FINDINGS: usize = 4;
const MAX_SOURCE_PATHS: usize = 36;
const MAX_CITATIONS: usize = 24;
const MAX_STORE_BYTES: usize = 512 * 1024;
const MAX_FINDING_CHARS: usize = 6000;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditorFinding {
    pub reviewer: String,
    pub text: String,
    #[serde(default)]
    pub citations: Vec<AuditorCitation>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditorCitation {
    pub path: String,
    pub line_start: u32,
    pub line_end: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditorSourceEvidence {
    pub path: String,
    pub sha256: String,
    pub line_count: u32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuditorProposal {
    id: String,
    name: String,
    source_package: String,
    #[serde(default)]
    package_sha256: Option<String>,
    source_paths: Vec<String>,
    #[serde(default)]
    source_evidence: Vec<AuditorSourceEvidence>,
    findings: Vec<AuditorFinding>,
    created_at: u64,
}

#[derive(Deserialize)]
struct ProposalDocument {
    version: u32,
    proposals: Vec<AuditorProposal>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProposalReview {
    proposal_id: String,
    status: String,
    updated_at: u64,
}

#[derive(Deserialize, Serialize)]
struct ReviewDocument {
    version: u32,
    reviews: Vec<ProposalReview>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditorProposalView {
    pub id: String,
    pub name: String,
    pub source_package: String,
    pub package_sha256: Option<String>,
    pub source_paths: Vec<String>,
    pub source_evidence: Vec<AuditorSourceEvidence>,
    pub findings: Vec<AuditorFinding>,
    pub created_at: u64,
    pub status: String,
}

fn data_path(file_name: &str) -> Result<PathBuf, String> {
    let app_data = std::env::var_os("APPDATA")
        .ok_or_else(|| "Windows roaming app-data is unavailable.".to_string())?;
    Ok(PathBuf::from(app_data).join("Capsule OS").join(file_name))
}

fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn valid_path(path: &str) -> bool {
    !path.trim().is_empty()
        && path.chars().count() <= 240
        && !path.contains('\0')
        && !path.replace('\\', "/").split('/').any(|part| part == "..")
}

fn valid_proposal(proposal: &AuditorProposal) -> bool {
    valid_id(&proposal.id)
        && !proposal.name.trim().is_empty()
        && proposal.name.chars().count() <= 120
        && !proposal.source_package.trim().is_empty()
        && proposal.source_package.chars().count() <= 160
        && proposal.package_sha256.as_ref().is_none_or(|hash| {
            hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        && proposal.source_paths.len() <= MAX_SOURCE_PATHS
        && proposal.source_paths.iter().all(|path| valid_path(path))
        && proposal.source_evidence.len() <= MAX_SOURCE_PATHS
        && proposal.source_evidence.iter().all(|evidence| {
            valid_path(&evidence.path)
                && evidence.sha256.len() == 64
                && evidence.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
                && evidence.line_count > 0
        })
        && !proposal.findings.is_empty()
        && proposal.findings.len() <= MAX_FINDINGS
        && proposal.findings.iter().all(|finding| {
            !finding.reviewer.trim().is_empty()
                && finding.reviewer.chars().count() <= 80
                && !finding.text.trim().is_empty()
                && finding.text.chars().count() <= MAX_FINDING_CHARS
                && finding.citations.len() <= MAX_CITATIONS
                && finding.citations.iter().all(|citation| {
                    proposal.source_evidence.iter().any(|evidence| {
                        evidence.path == citation.path
                            && citation.line_start > 0
                            && citation.line_end >= citation.line_start
                            && citation.line_end <= evidence.line_count
                            && citation.line_end - citation.line_start <= 40
                    })
                })
        })
}

async fn load_proposals() -> Result<Vec<AuditorProposal>, String> {
    let path = data_path("auditor-proposals.json")?;
    let content = match tokio::fs::read(path).await {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Unable to read local auditor proposals: {error}")),
    };
    if content.len() > MAX_STORE_BYTES {
        return Err("The local auditor proposal library exceeds the size limit.".to_string());
    }
    let document: ProposalDocument = serde_json::from_slice(&content)
        .map_err(|_| "The local auditor proposal library is malformed.".to_string())?;
    let mut ids = document
        .proposals
        .iter()
        .map(|proposal| proposal.id.as_str())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    if document.version != 1
        || document.proposals.len() > MAX_PROPOSALS
        || document
            .proposals
            .iter()
            .any(|proposal| !valid_proposal(proposal))
        || ids.len() != document.proposals.len()
    {
        return Err(
            "The local auditor proposal library is invalid or exceeds its limits.".to_string(),
        );
    }
    Ok(document.proposals)
}

async fn load_reviews() -> Result<ReviewDocument, String> {
    let path = data_path("auditor-proposal-reviews.json")?;
    let content = match tokio::fs::read(path).await {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ReviewDocument {
                version: 1,
                reviews: Vec::new(),
            });
        }
        Err(error) => {
            return Err(format!(
                "Unable to read local auditor review states: {error}"
            ));
        }
    };
    if content.len() > MAX_STORE_BYTES {
        return Err("The local auditor review states exceed the size limit.".to_string());
    }
    let document: ReviewDocument = serde_json::from_slice(&content)
        .map_err(|_| "The local auditor review states are malformed.".to_string())?;
    let mut ids = document
        .reviews
        .iter()
        .map(|review| review.proposal_id.as_str())
        .collect::<Vec<_>>();
    ids.sort_unstable();
    ids.dedup();
    if document.version != 1
        || document.reviews.len() > MAX_PROPOSALS
        || document.reviews.iter().any(|review| {
            !valid_id(&review.proposal_id)
                || !matches!(review.status.as_str(), "reviewed" | "dismissed")
        })
        || ids.len() != document.reviews.len()
    {
        return Err(
            "The local auditor review states are invalid or exceed their limits.".to_string(),
        );
    }
    Ok(document)
}

async fn store_reviews(document: &ReviewDocument) -> Result<(), String> {
    let path = data_path("auditor-proposal-reviews.json")?;
    let parent = path
        .parent()
        .ok_or_else(|| "The local auditor review path is invalid.".to_string())?;
    tokio::fs::create_dir_all(parent)
        .await
        .map_err(|error| format!("Unable to create the local Capsule data folder: {error}"))?;
    let content = serde_json::to_vec_pretty(document)
        .map_err(|error| format!("Unable to serialize auditor review states: {error}"))?;
    if content.len() > MAX_STORE_BYTES {
        return Err("The local auditor review states exceed the size limit.".to_string());
    }
    let temporary = path.with_extension("json.tmp");
    tokio::fs::write(&temporary, content)
        .await
        .map_err(|error| format!("Unable to write auditor review states: {error}"))?;
    tokio::fs::rename(&temporary, &path)
        .await
        .map_err(|error| format!("Unable to save auditor review states: {error}"))
}

#[command]
pub async fn list_auditor_proposals() -> Result<Vec<AuditorProposalView>, String> {
    let proposals = load_proposals().await?;
    let reviews = load_reviews().await?.reviews;
    Ok(proposals
        .into_iter()
        .map(|proposal| {
            let status = reviews
                .iter()
                .find(|review| review.proposal_id == proposal.id)
                .map(|review| review.status.clone())
                .unwrap_or_else(|| "pending".to_string());
            AuditorProposalView {
                id: proposal.id,
                name: proposal.name,
                source_package: proposal.source_package,
                package_sha256: proposal.package_sha256,
                source_paths: proposal.source_paths,
                source_evidence: proposal.source_evidence,
                findings: proposal.findings,
                created_at: proposal.created_at,
                status,
            }
        })
        .collect())
}

#[command]
pub async fn review_auditor_proposal(proposal_id: String, status: String) -> Result<(), String> {
    if !valid_id(&proposal_id) || !matches!(status.as_str(), "reviewed" | "dismissed") {
        return Err("Choose a valid auditor proposal and review state.".to_string());
    }
    if !load_proposals()
        .await?
        .iter()
        .any(|proposal| proposal.id == proposal_id)
    {
        return Err("That auditor proposal no longer exists.".to_string());
    }
    let mut document = load_reviews().await?;
    let updated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64;
    if let Some(review) = document
        .reviews
        .iter_mut()
        .find(|review| review.proposal_id == proposal_id)
    {
        review.status = status;
        review.updated_at = updated_at;
    } else {
        if document.reviews.len() >= MAX_PROPOSALS {
            return Err("The local auditor review history is full.".to_string());
        }
        document.reviews.push(ProposalReview {
            proposal_id,
            status,
            updated_at,
        });
    }
    store_reviews(&document).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn proposal() -> AuditorProposal {
        AuditorProposal {
            id: "01234567-89ab-cdef-0123-456789abcdef".to_string(),
            name: "Mod audit references".to_string(),
            source_package: "sample.jar".to_string(),
            package_sha256: None,
            source_paths: vec!["src/mod.js".to_string()],
            source_evidence: vec![],
            findings: vec![AuditorFinding {
                reviewer: "Usefulness Reviewer".to_string(),
                text: "The source appears to register a new item.".to_string(),
                citations: vec![],
            }],
            created_at: 1,
        }
    }

    #[test]
    fn accepts_inert_source_linked_proposal() {
        assert!(valid_proposal(&proposal()));
    }

    #[test]
    fn rejects_path_traversal_and_oversized_findings() {
        let mut invalid = proposal();
        invalid.source_paths = vec!["../outside.js".to_string()];
        assert!(!valid_proposal(&invalid));

        let mut invalid = proposal();
        invalid.findings[0].text = "x".repeat(MAX_FINDING_CHARS + 1);
        assert!(!valid_proposal(&invalid));
    }

    #[test]
    fn validates_citation_ranges_against_fingerprinted_evidence() {
        let mut candidate = proposal();
        candidate.package_sha256 = Some("b".repeat(64));
        candidate.source_evidence = vec![AuditorSourceEvidence {
            path: "src/mod.js".to_string(),
            sha256: "a".repeat(64),
            line_count: 4,
        }];
        candidate.findings[0].citations = vec![AuditorCitation {
            path: "src/mod.js".to_string(),
            line_start: 2,
            line_end: 4,
        }];
        assert!(valid_proposal(&candidate));

        candidate.findings[0].citations[0].line_end = 5;
        assert!(!valid_proposal(&candidate));
    }
}
