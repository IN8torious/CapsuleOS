// Capsule OS playbook builder. Pure data and string building, so the Toolbox UI and Node share one source.
// Every tweak is a reversible registry value with a documented Windows default (revert === null means "delete the
// value", which is how Windows ships it). No scripts, services, drivers, app removal or security features
// (Defender, Windows Update, Firewall, SmartScreen) are touched. Output is declarative; a human installs it.

const U = 'HKCU';
const M = 'HKLM';
const EXPLORER = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer';
const EXPLORER_ADV = `${EXPLORER}\\Advanced`;
const CDM = 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
const PERSONALIZE = 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
const SEARCH = 'Software\\Microsoft\\Windows\\CurrentVersion\\Search';
const DESKTOP = 'Control Panel\\Desktop';
const DATA_COLLECTION = 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection';
const SYSTEM_PROFILE = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';
const CLOUD_CONTENT_M = 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent';
const CLOUD_CONTENT_U = 'Software\\Policies\\Microsoft\\Windows\\CloudContent';
const POLICY_SYSTEM = 'SOFTWARE\\Policies\\Microsoft\\Windows\\System';
const GAME_STORE = 'System\\GameConfigStore';
const ACCESS = 'Control Panel\\Accessibility';

const dword = (root, path, name, apply, revert) => ({ root, path, name, type: 'REG_DWORD', apply: String(apply), revert: revert === null ? null : String(revert) });
const sz = (root, path, name, apply, revert) => ({ root, path, name, type: 'REG_SZ', apply: String(apply), revert: revert === null ? null : String(revert) });
const tweak = (id, category, title, description, risk, values) => ({ id, category, title, description, risk, values });

export const CATEGORIES = Object.freeze({
  appearance: 'Appearance',
  privacy: 'Privacy',
  clean: 'Debloat-lite',
  explorer: 'File Explorer',
  performance: 'Performance',
  gaming: 'Gaming',
  hardening: 'Hardening',
  network: 'Internet',
});

export const TWEAKS = Object.freeze([
  // Appearance
  tweak('dark-theme', 'appearance', 'Windows dark theme', 'Dark theme for apps and the system.', 'low', [
    dword(U, PERSONALIZE, 'AppsUseLightTheme', 0, 1), dword(U, PERSONALIZE, 'SystemUsesLightTheme', 0, 1)]),
  tweak('no-transparency', 'appearance', 'Turn off transparency', 'Disable translucent window and taskbar effects.', 'low', [
    dword(U, PERSONALIZE, 'EnableTransparency', 0, 1)]),
  tweak('no-window-animations', 'appearance', 'Turn off window animations', 'Disable minimize and maximize animations.', 'low', [
    sz(U, 'Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', 0, 1)]),
  tweak('taskbar-left', 'appearance', 'Left-aligned taskbar', 'Windows 11: align taskbar icons to the left.', 'low', [
    dword(U, EXPLORER_ADV, 'TaskbarAl', 0, 1)]),
  tweak('hide-chat', 'appearance', 'Hide the Chat button', 'Windows 11: remove the Teams chat button from the taskbar.', 'low', [
    dword(U, EXPLORER_ADV, 'TaskbarMn', 0, 1)]),
  tweak('hide-task-view', 'appearance', 'Hide the Task View button', 'Remove the Task View button from the taskbar.', 'low', [
    dword(U, EXPLORER_ADV, 'ShowTaskViewButton', 0, 1)]),
  tweak('compact-explorer', 'appearance', 'Compact File Explorer rows', 'Windows 11: reduce spacing in File Explorer lists.', 'low', [
    dword(U, EXPLORER_ADV, 'UseCompactMode', 1, 0)]),

  // Privacy
  tweak('no-advertising-id', 'privacy', 'Turn off the advertising ID', 'Stop apps using a per-user advertising identifier.', 'low', [
    dword(U, 'Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 0, 1)]),
  tweak('no-tailored-experiences', 'privacy', 'No tailored experiences', 'Do not use diagnostic data to personalise tips and ads.', 'low', [
    dword(U, CLOUD_CONTENT_U, 'DisableTailoredExperiencesWithDiagnosticData', 1, null)]),
  tweak('no-bing-search', 'privacy', 'Keep web results out of Start search', 'Search only your PC from the Start menu.', 'low', [
    dword(U, SEARCH, 'BingSearchEnabled', 0, 1),
    dword(U, 'Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 1, null)]),
  tweak('no-copilot', 'privacy', 'Turn off Windows Copilot', 'Disable the Copilot sidebar via the user policy.', 'low', [
    dword(U, 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1, null)]),
  tweak('no-recall', 'privacy', 'Turn off AI data analysis (Recall)', 'Stop Windows saving snapshots of your activity for AI features.', 'low', [
    dword(U, 'Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1, null)]),
  tweak('no-activity-history', 'privacy', 'Turn off activity history', 'Stop Windows recording and syncing activity history.', 'low', [
    dword(M, POLICY_SYSTEM, 'EnableActivityFeed', 0, null), dword(M, POLICY_SYSTEM, 'PublishUserActivities', 0, null),
    dword(M, POLICY_SYSTEM, 'UploadUserActivities', 0, null)]),
  tweak('minimum-telemetry', 'privacy', 'Minimum diagnostic data', 'Ask Windows to send only required diagnostic data (the lowest level your edition honours).', 'medium', [
    dword(M, DATA_COLLECTION, 'AllowTelemetry', 0, null), dword(M, DATA_COLLECTION, 'DoNotShowFeedbackNotifications', 1, null)]),
  tweak('no-feedback-prompts', 'privacy', 'No feedback prompts', 'Stop Windows asking for feedback.', 'low', [
    dword(U, 'Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', 0, null)]),
  tweak('no-error-reporting', 'privacy', 'Turn off Windows Error Reporting', 'Do not send crash reports to Microsoft.', 'medium', [
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 1, 0)]),
  tweak('no-input-personalization', 'privacy', 'No typing and inking collection', 'Stop collecting typing and handwriting samples.', 'low', [
    dword(U, 'Software\\Microsoft\\InputPersonalization', 'RestrictImplicitTextCollection', 1, 0),
    dword(U, 'Software\\Microsoft\\InputPersonalization', 'RestrictImplicitInkCollection', 1, 0)]),
  tweak('no-location', 'privacy', 'Deny location access by default', 'Block location for apps unless you allow it per app.', 'medium', [
    sz(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\location', 'Value', 'Deny', 'Allow')]),
  tweak('no-background-apps', 'privacy', 'Stop apps running in the background', 'Prevent Store apps from running while closed.', 'medium', [
    dword(U, 'Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', 1, 0)]),
  tweak('no-delivery-sharing', 'privacy', 'No peer-to-peer update sharing', 'Download updates only from Microsoft, not other PCs.', 'low', [
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config', 'DODownloadMode', 0, null)]),

  // Debloat-lite (settings only; no apps are removed)
  tweak('no-consumer-features', 'clean', 'No auto-installed promoted apps', 'Stop Windows installing suggested apps and promotions.', 'low', [
    dword(M, CLOUD_CONTENT_M, 'DisableWindowsConsumerFeatures', 1, null)]),
  tweak('no-spotlight', 'clean', 'No Windows Spotlight extras', 'Remove Spotlight promotions and tips.', 'low', [
    dword(U, CLOUD_CONTENT_U, 'DisableWindowsSpotlightFeatures', 1, null)]),
  tweak('no-start-suggestions', 'clean', 'No Start menu suggestions', 'Remove suggested apps and promotions from Start.', 'low', [
    dword(U, CDM, 'SystemPaneSuggestionsEnabled', 0, 1), dword(U, CDM, 'SubscribedContent-338388Enabled', 0, 1),
    dword(U, CDM, 'SubscribedContent-338389Enabled', 0, 1), dword(U, CDM, 'SilentInstalledAppsEnabled', 0, 1)]),
  tweak('no-lock-screen-tips', 'clean', 'No lock screen tips and ads', 'Remove tips, tricks and promotions from the lock screen.', 'low', [
    dword(U, CDM, 'RotatingLockScreenOverlayEnabled', 0, 1), dword(U, CDM, 'SubscribedContent-338387Enabled', 0, 1)]),
  tweak('no-settings-suggestions', 'clean', 'No suggestions in Settings', 'Remove suggested content from the Settings app.', 'low', [
    dword(U, CDM, 'SubscribedContent-338393Enabled', 0, 1), dword(U, CDM, 'SubscribedContent-353694Enabled', 0, 1),
    dword(U, CDM, 'SubscribedContent-353696Enabled', 0, 1)]),
  tweak('no-widgets-feed', 'clean', 'Turn off the Widgets feed', 'Disable the news and interests feed by policy.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Dsh', 'AllowNewsAndInterests', 0, null)]),
  tweak('no-onedrive-sync', 'clean', 'Turn off OneDrive file sync', 'Stop OneDrive syncing (the app stays installed).', 'medium', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\OneDrive', 'DisableFileSyncNGSC', 1, null)]),
  tweak('no-autoplay', 'clean', 'Turn off AutoPlay', 'Do not auto-open removable drives and discs.', 'low', [
    dword(U, `${EXPLORER}\\AutoplayHandlers`, 'DisableAutoplay', 1, 0)]),

  // File Explorer
  tweak('show-extensions', 'explorer', 'Show file extensions', 'Always show file extensions in names.', 'low', [
    dword(U, EXPLORER_ADV, 'HideFileExt', 0, 1)]),
  tweak('show-hidden-files', 'explorer', 'Show hidden files', 'Show hidden files and folders.', 'low', [
    dword(U, EXPLORER_ADV, 'Hidden', 1, 2)]),
  tweak('explorer-this-pc', 'explorer', 'Open File Explorer to This PC', 'Start File Explorer at This PC instead of Home.', 'low', [
    dword(U, EXPLORER_ADV, 'LaunchTo', 1, 2)]),
  tweak('no-recent-files', 'explorer', 'No recent and frequent lists', 'Stop File Explorer listing recent files and frequent folders.', 'low', [
    dword(U, EXPLORER, 'ShowRecent', 0, 1), dword(U, EXPLORER, 'ShowFrequent', 0, 1)]),
  tweak('full-path-title', 'explorer', 'Full path in the title bar', 'Show the whole folder path in File Explorer.', 'low', [
    dword(U, `${EXPLORER}\\CabinetState`, 'FullPath', 1, 0)]),

  // Performance
  tweak('fast-menus', 'performance', 'Faster menus', 'Remove the delay before menus open.', 'low', [
    sz(U, DESKTOP, 'MenuShowDelay', 0, 400)]),
  tweak('fast-shutdown', 'performance', 'Faster app shutdown', 'Close hung apps sooner at sign-out and shutdown.', 'medium', [
    sz(U, DESKTOP, 'AutoEndTasks', 1, 0), sz(U, DESKTOP, 'HungAppTimeout', 3000, 5000), sz(U, DESKTOP, 'WaitToKillAppTimeout', 5000, 20000)]),
  tweak('no-startup-delay', 'performance', 'No startup app delay', 'Launch startup apps immediately after sign-in.', 'low', [
    dword(U, `${EXPLORER}\\Serialize`, 'StartupDelayInMSec', 0, null)]),
  tweak('best-performance-visuals', 'performance', 'Visual effects for performance', 'Use the "adjust for best performance" visual effects preset.', 'medium', [
    dword(U, `${EXPLORER}\\VisualEffects`, 'VisualFXSetting', 2, 0)]),
  tweak('responsive-multimedia', 'performance', 'Prioritise foreground apps', 'Reserve less CPU for background multimedia tasks and lift network throttling.', 'medium', [
    dword(M, SYSTEM_PROFILE, 'SystemResponsiveness', 10, 20), dword(M, SYSTEM_PROFILE, 'NetworkThrottlingIndex', 4294967295, 10)]),

  // Gaming
  tweak('no-game-dvr', 'gaming', 'Turn off Game DVR capture', 'Stop background game recording overhead.', 'low', [
    dword(U, GAME_STORE, 'GameDVR_Enabled', 0, 1),
    dword(U, 'Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 0, 1)]),
  tweak('raw-mouse-input', 'gaming', 'Raw mouse input (no acceleration)', 'Turn off pointer acceleration for 1:1 aiming.', 'low', [
    sz(U, 'Control Panel\\Mouse', 'MouseSpeed', 0, 1), sz(U, 'Control Panel\\Mouse', 'MouseThreshold1', 0, 6),
    sz(U, 'Control Panel\\Mouse', 'MouseThreshold2', 0, 10)]),
  tweak('no-sticky-prompts', 'gaming', 'No Sticky Keys pop-ups', 'Stop the accessibility shortcut prompts interrupting games.', 'low', [
    sz(U, `${ACCESS}\\StickyKeys`, 'Flags', 506, 510), sz(U, `${ACCESS}\\Keyboard Response`, 'Flags', 122, 126),
    sz(U, `${ACCESS}\\ToggleKeys`, 'Flags', 58, 62)]),
  tweak('fullscreen-optimizations-off', 'gaming', 'Classic fullscreen behaviour', 'Disable fullscreen optimizations system-wide.', 'medium', [
    dword(U, GAME_STORE, 'GameDVR_FSEBehaviorMode', 2, 0), dword(U, GAME_STORE, 'GameDVR_DXGIHonorFSEWindowsCompatible', 1, 0)]),
  tweak('gpu-scheduling', 'gaming', 'Hardware-accelerated GPU scheduling', 'Let a supported GPU manage its own memory scheduling. Needs a restart.', 'medium', [
    dword(M, 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 2, null)]),
  tweak('no-power-throttling', 'gaming', 'Turn off power throttling', 'Stop Windows throttling background apps to save power. Uses more battery.', 'medium', [
    dword(M, 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 1, null)]),

  // Hardening
  tweak('no-remote-assistance', 'hardening', 'Turn off Remote Assistance', 'Do not allow inbound Remote Assistance requests.', 'low', [
    dword(M, 'SYSTEM\\CurrentControlSet\\Control\\Remote Assistance', 'fAllowToGetHelp', 0, 1)]),
  tweak('no-llmnr', 'hardening', 'Turn off LLMNR', 'Disable a legacy name-resolution protocol used in spoofing attacks.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'EnableMulticast', 0, null)]),
  tweak('no-autorun', 'hardening', 'Turn off AutoRun on all drives', 'Never run programs automatically from drives.', 'low', [
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoDriveTypeAutoRun', 255, null)]),

  // Internet
  tweak('doh-allowed', 'network', 'Allow encrypted DNS (DoH)', 'Let Windows use DNS over HTTPS with servers it knows support it.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'DoHPolicy', 2, null)]),
  tweak('no-smart-name-resolution', 'network', 'Stop smart multi-homed DNS queries', 'Do not send a lookup to every network adapter at once, which can leak names to the wrong network.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'DisableSmartNameResolution', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'DisableParallelAandAAAA', 1, null)]),
  tweak('no-connectivity-probe', 'network', 'Skip the internet connectivity probe', 'Stop contacting a Microsoft server to test the connection. The network icon may then show limited access.', 'medium', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\NetworkConnectivityStatusIndicator', 'NoActiveProbe', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\NetworkConnectivityStatusIndicator', 'DisablePassivePolling', 1, null)]),
  tweak('no-wifi-sense-hotspots', 'network', 'No automatic open-hotspot connections', 'Do not auto-connect to suggested open Wi-Fi hotspots.', 'low', [
    dword(M, 'SOFTWARE\\Microsoft\\WcmSvc\\wifinetworkmanager\\config', 'AutoConnectAllowedOEM', 0, null)]),

  // Curated from the Capsule Ecology catalog: split into single-purpose settings, policy values revert by
  // deletion (absent is the Windows default) and preference values revert to their documented default.
  tweak('hide-widgets-button', 'appearance', 'Hide the Widgets button', 'Windows 11: remove the Widgets button from the taskbar.', 'low', [
    dword(U, EXPLORER_ADV, 'TaskbarDa', 0, null)]),
  tweak('hide-meet-now', 'appearance', 'Hide Meet Now', 'Remove the legacy Meet Now button from the notification area.', 'low', [
    dword(U, 'Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'HideSCAMeetNow', 1, null)]),
  tweak('search-icon-only', 'appearance', 'Search as an icon', 'Show taskbar search as a compact icon instead of a box.', 'low', [
    dword(U, SEARCH, 'SearchboxTaskbarMode', 1, 2)]),
  tweak('no-ceip', 'privacy', 'Leave the Customer Experience Program', 'Opt out of the legacy CEIP and its App-V, Internet Explorer and Messenger variants.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', 'CEIPEnable', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\AppV\\CEIP', 'CEIPEnable', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Internet Explorer\\SQM', 'DisableCustomerImprovementProgram', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Messenger\\Client', 'CEIP', 2, null)]),
  tweak('no-app-telemetry', 'privacy', 'No application inventory telemetry', 'Stop the inventory collector, steps recorder and application telemetry. The compatibility assistant stays on.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'AITEnable', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'DisableInventory', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', 'DisableUAR', 1, null)]),
  tweak('limit-diagnostic-data', 'privacy', 'Limit diagnostic extras', 'Keep the device name, crash dumps and extra diagnostic logs out of diagnostic data.', 'low', [
    dword(M, DATA_COLLECTION, 'AllowDeviceNameInTelemetry', 0, null),
    dword(M, DATA_COLLECTION, 'LimitDiagnosticLogCollection', 1, null),
    dword(M, DATA_COLLECTION, 'LimitDumpCollection', 1, null),
    dword(M, DATA_COLLECTION, 'DisableTelemetryOptInChangeNotification', 1, null)]),
  tweak('private-error-reports', 'privacy', 'Private error reports', 'Error reporting stays available but never sends extra data or approves dumps automatically.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'DontSendAdditionalData', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'AutoApproveOSDumps', 0, null)]),
  tweak('no-handwriting-sharing', 'privacy', 'Keep handwriting on this PC', 'Do not share handwriting samples or handwriting error reports.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\TabletPC', 'PreventHandwritingDataSharing', 1, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\HandwritingErrorReports', 'PreventHandwritingErrorReports', 1, null)]),
  tweak('no-help-feedback', 'privacy', 'No help-experience feedback', 'Turn off online assistance ratings and implicit feedback in Windows Help.', 'low', [
    dword(U, 'Software\\Policies\\Microsoft\\Assistance\\Client\\1.0', 'NoOnlineAssist', 1, null),
    dword(U, 'Software\\Policies\\Microsoft\\Assistance\\Client\\1.0', 'NoExplicitFeedback', 1, null),
    dword(U, 'Software\\Policies\\Microsoft\\Assistance\\Client\\1.0', 'NoImplicitFeedback', 1, null)]),
  tweak('no-cloud-search', 'privacy', 'Search without the cloud', 'Windows Search stays local: no cloud content, web results or location.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCloudSearch', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowSearchToUseLocation', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'ConnectedSearchUseWeb', 0, null),
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'DisableWebSearch', 1, null)]),
  tweak('no-message-sync', 'privacy', 'Keep text messages off the cloud', 'Do not back up text messages to Microsoft services.', 'low', [
    dword(M, 'SOFTWARE\\Policies\\Microsoft\\Windows\\Messaging', 'AllowMessageSync', 0, null)]),
  tweak('no-preinstalled-promos', 'clean', 'No promoted app installs', 'Stop Windows and OEM promotions from installing suggested apps.', 'low', [
    dword(U, CDM, 'PreInstalledAppsEnabled', 0, 1),
    dword(U, CDM, 'PreInstalledAppsEverEnabled', 0, 1),
    dword(U, CDM, 'OemPreInstalledAppsEnabled', 0, 1)]),
  tweak('no-tips', 'clean', 'No tips and welcome tours', 'Turn off Windows tips, the welcome experience and soft-landing prompts.', 'low', [
    dword(U, CDM, 'SoftLandingEnabled', 0, 1),
    dword(U, CDM, 'SubscribedContent-310093Enabled', 0, null),
    dword(M, CLOUD_CONTENT_M, 'DisableSoftLanding', 1, null)]),
  tweak('no-third-party-suggestions', 'clean', 'No third-party suggestions', 'Keep Spotlight and partner suggestions out of Settings, notifications and the welcome screen.', 'low', [
    dword(U, CLOUD_CONTENT_U, 'DisableThirdPartySuggestions', 1, null),
    dword(U, CLOUD_CONTENT_U, 'DisableWindowsSpotlightOnActionCenter', 1, null),
    dword(U, CLOUD_CONTENT_U, 'DisableWindowsSpotlightOnSettings', 1, null),
    dword(U, CLOUD_CONTENT_U, 'DisableWindowsSpotlightWindowsWelcomeExperience', 1, null)]),
  tweak('no-cloud-optimized-content', 'clean', 'No cloud-optimized content', 'Stop Windows downloading promoted taskbar and Start content.', 'low', [
    dword(M, CLOUD_CONTENT_M, 'DisableCloudOptimizedContent', 1, null)]),
  tweak('no-setup-nag', 'clean', 'No "finish setting up" nag', 'Stop the full-screen prompt to finish setting up your device with Microsoft services.', 'low', [
    dword(U, 'Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', 'ScoobeSystemSettingEnabled', 0, null)]),
  tweak('no-feature-balloons', 'clean', 'No feature advertisement balloons', 'Hide notification-area balloons that advertise Windows features.', 'low', [
    dword(U, 'Software\\Policies\\Microsoft\\Windows\\Explorer', 'NoBalloonFeatureAdvertisements', 1, null)]),
  tweak('no-sync-provider-ads', 'explorer', 'No OneDrive ads in File Explorer', 'Hide sync-provider notifications inside File Explorer.', 'low', [
    dword(U, EXPLORER_ADV, 'ShowSyncProviderNotifications', 0, null)]),
  tweak('no-web-wizards', 'explorer', 'No web-service wizards', 'Remove legacy publish-to-web, online print ordering and "look for an app online" prompts.', 'low', [
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoWebServices', 1, null),
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoPublishingWizard', 1, null),
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoOnlinePrintsWizard', 1, null),
    dword(M, 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'NoInternetOpenWith', 1, null)]),
  tweak('classic-photo-viewer', 'explorer', 'Offer Windows Photo Viewer', 'Add the classic Photo Viewer to "Open with" for common image types. Your default app is not changed.', 'low',
    // Windows only ships the Tiff ProgID; .tif and .tiff are registered by default and are left alone.
    ['.jpg', '.jpeg', '.jpe', '.jfif', '.png', '.gif', '.bmp', '.dib', '.ico'].map((extension) => sz(M,
      'SOFTWARE\\Microsoft\\Windows Photo Viewer\\Capabilities\\FileAssociations', extension, 'PhotoViewer.FileAssoc.Tiff', null))),
  tweak('calls-keep-volume', 'gaming', 'Calls do not lower other sounds', 'Keep game and media volume unchanged during voice calls.', 'low', [
    dword(U, 'Software\\Microsoft\\Multimedia\\Audio', 'UserDuckingPreference', 3, null)]),
  tweak('no-firmware-executables', 'hardening', 'Block firmware-injected programs', 'Do not run programs that PC firmware asks Windows to install (WPBT). OEM utilities that rely on it must be installed normally.', 'medium', [
    dword(M, 'SYSTEM\\CurrentControlSet\\Control\\Session Manager', 'DisableWpbtExecution', 1, null)]),
]);

const pick = (...ids) => Object.freeze(ids);
const all = TWEAKS.map((entry) => entry.id);
const ofCategory = (...categories) => TWEAKS.filter((entry) => categories.includes(entry.category)).map((entry) => entry.id);

// Presets are named bundles of catalog ids. "Balanced" is the recommended default.
export const PRESETS = Object.freeze([
  { id: 'balanced', title: 'Balanced', description: 'Recommended: privacy, quiet desktop and low-risk speed-ups.',
    tweakIds: TWEAKS.filter((entry) => entry.risk === 'low' && ['privacy', 'clean', 'explorer'].includes(entry.category)
      && !['no-onedrive-sync', 'no-widgets-feed', 'classic-photo-viewer'].includes(entry.id)).map((entry) => entry.id)
      .concat(pick('dark-theme', 'fast-menus', 'no-game-dvr', 'hide-chat')) },
  { id: 'privacy', title: 'Privacy', description: 'Less data leaving the PC, no ads or web search in Start.',
    tweakIds: ofCategory('privacy', 'clean') },
  { id: 'gaming', title: 'Gaming', description: 'Lower latency and fewer interruptions while playing.',
    tweakIds: pick('no-transparency', 'no-window-animations', 'no-game-dvr', 'raw-mouse-input', 'no-sticky-prompts',
      'fast-menus', 'fast-shutdown', 'responsive-multimedia', 'no-power-throttling', 'gpu-scheduling', 'no-background-apps') },
  { id: 'lean', title: 'Lean and fast', description: 'Trim effects, delays and background work.',
    tweakIds: ofCategory('performance').concat(pick('no-transparency', 'no-window-animations', 'no-background-apps',
      'no-game-dvr', 'no-consumer-features', 'no-widgets-feed')) },
  { id: 'clean', title: 'Clean desktop', description: 'Dark, quiet and uncluttered with no promotions.',
    tweakIds: ofCategory('clean').concat(pick('dark-theme', 'hide-chat', 'hide-task-view', 'show-extensions',
      'explorer-this-pc')) },
  { id: 'everything', title: 'Everything', description: 'Every catalog tweak, including medium-risk ones.', tweakIds: all },
]);

// Browser choice page. Edge is first-class and the default; it is also the way back for PCs where
// another playbook removed or blocked it. Icons are CapsuleOS monograms, not vendor logos.
export const BROWSERS = Object.freeze([
  { id: 'edge', name: 'Microsoft Edge', text: 'Edge', top: '#2BC3D2', bottom: '#0B5FB0' },
  { id: 'firefox', name: 'Mozilla Firefox', text: 'Firefox', top: '#FFB13B', bottom: '#E3402B' },
  { id: 'brave', name: 'Brave', text: 'Brave', top: '#FF7A3D', bottom: '#C42B1C' },
  { id: 'librewolf', name: 'LibreWolf', text: 'LibreWolf', top: '#4FA3F7', bottom: '#2A3F8F' },
]);

// The fixed scripts a unified playbook ships in Executables. Nothing else is ever executed.
export const PLAYBOOK_SCRIPTS = Object.freeze([
  'Capsule.Common.psm1', 'Start-CapsuleSession.ps1', 'Restore-CapsuleBaseline.ps1',
  'Install-CapsuleBrowser.ps1', 'Install-CapsulePack.ps1', 'Uninstall-CapsulePack.ps1', 'Apply-CapsuleTweaks.ps1',
  'repair/Install-CapsuleRepair.ps1', 'repair/Uninstall-CapsuleRepair.ps1', 'repair/Repair-Windows.ps1',
  'repair/Repair-Windows.cmd', 'repair/Quick-SFC-Scan.cmd', 'repair/README-Repair.txt',
]);

const escapeXml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const yamlQuote = (text) => `'${String(text).replace(/'/g, "''")}'`;
export const needsAdmin = (entry) => entry.values.some((value) => value.root === 'HKLM');

export function selectTweaks({ tweakIds, preset } = {}) {
  let wanted = tweakIds;
  if (preset) {
    const found = PRESETS.find((entry) => entry.id === preset);
    if (!found) throw new Error(`Unknown preset "${preset}".`);
    wanted = [...found.tweakIds, ...(Array.isArray(tweakIds) ? tweakIds : [])];
  }
  if (!Array.isArray(wanted) || !wanted.length) wanted = PRESETS[0].tweakIds;
  const seen = new Set();
  const picked = [];
  for (const id of wanted) {
    const entry = TWEAKS.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`Unknown tweak "${id}". Only catalog tweaks can be exported.`);
    if (!seen.has(id)) {
      seen.add(id);
      picked.push(entry);
    }
  }
  return picked;
}

function actionLine(value, mode, option, currentUserOnly = false) {
  const location = `path: ${yamlQuote(`${value.root}\\${value.path}`)}, value: ${yamlQuote(value.name)}`;
  const data = value[mode];
  const optionField = `, option: ${yamlQuote(option)}${currentUserOnly && value.root === 'HKCU' ? ', scope: currentUser' : ''}`;
  if (data === null) return `  - !registryValue: {${location}, operation: delete${optionField}}`;
  return `  - !registryValue: {${location}, data: ${yamlQuote(data)}, type: ${value.type}${optionField}}`;
}

function scriptAction(comment, script, args, option, weight, errorAction, failure) {
  const optionLine = option ? [`    option: ${yamlQuote(option)}`] : [];
  // Windows PowerShell 5.1 -File cannot pass -Confirm:$false; -Command keeps it a Boolean.
  const invocation = script === 'Restore-CapsuleBaseline.ps1'
    ? `-Command ${yamlQuote(`& '.\\${script}' ${args}`)}`
    : `-File ".\\${script.replace(/\//g, '\\')}"${args ? ` ${args}` : ''}`;
  return [
    `  # ${comment}`,
    '  - !powerShell:',
    '    exeDir: true',
    '    command: >-',
    `      & "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass ${invocation};`,
    `      if ($LASTEXITCODE -ne 0) { throw "${failure} (exit $LASTEXITCODE)." }`,
    '    runas: currentUserElevated',
    '    wait: true',
    `    errorAction: ${errorAction}`,
    `    handleExitCodes: {'!0': ${errorAction === 'Halt' ? 'halt' : 'error'}}`,
    ...optionLine,
    `    weight: ${weight}`,
  ];
}

function actionsYaml(tweaks, mode, includeToolboxInstaller, extras = null) {
  const lines = ['---', `title: ${yamlQuote(mode === 'apply' ? 'Capsule OS tweaks' : 'Revert Capsule OS tweaks')}`, 'actions:'];
  if (mode === 'revert' && extras) {
    for (const option of [...tweaks.map((entry) => `capsule-${entry.id}`), ...extras.browsers.filter((browser) => browser.id === 'edge').map(() => 'browser-edge')]) {
      lines.push(...scriptAction(`Restore captured values: ${option}`, 'Restore-CapsuleBaseline.ps1',
        `-Option ${option} -Confirm:$false`, option, 5, 'Halt', 'CapsuleOS baseline restore failed'));
    }
    return `${lines.join('\n')}\n`;
  }
  if (mode === 'apply' && extras) {
    lines.push(...scriptAction('Safety first: restore point, baseline of every value below, care scripts. Nothing else runs if this fails.',
      'Start-CapsuleSession.ps1', '', null, 40, 'Halt', 'CapsuleOS could not create a restore point or baseline'));
  }
  for (const category of Object.keys(CATEGORIES)) {
    const group = tweaks.filter((entry) => entry.category === category);
    if (!group.length) continue;
    lines.push(`  # ${CATEGORIES[category]}`);
    for (const entry of group) {
      lines.push(`  # ${entry.title} [${entry.risk} risk${needsAdmin(entry) ? ', needs admin' : ''}]`);
      for (const value of entry.values) lines.push(actionLine(value, mode, `capsule-${entry.id}`, Boolean(extras)));
    }
  }
  if (mode === 'apply' && extras) {
    if (extras.repair) {
      lines.push(...scriptAction('Repair toolkit: copies DISM + SFC scripts and adds "Repair Windows" shortcuts.',
        'repair/Install-CapsuleRepair.ps1', '', 'capsule-repair-toolkit', 10, 'Notify', 'Repair toolkit installation failed'));
    }
    for (const browser of extras.browsers) {
      lines.push(...scriptAction(`Browser: ${browser.name}`, 'Install-CapsuleBrowser.ps1', `-Browser ${browser.id}`,
        `browser-${browser.id}`, 60, 'Notify', `${browser.name} installation failed`));
    }
    for (const pack of extras.packs) {
      lines.push(...scriptAction(`Environment Capsule: ${pack.name}`, 'Install-CapsulePack.ps1', `-Pack ${pack.id}`,
        `pack-${pack.id}`, 80, 'Notify', 'Environment Capsule installation failed'));
    }
  }
  if (mode === 'apply' && includeToolboxInstaller) {
    lines.push(
      '  # Optional companion app; only runs when explicitly selected in AME Wizard.',
      '  - !powerShell:',
      '    exeDir: true',
      '    command: >-',
      '      & "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File ".\\Install-CapsuleToolbox.ps1";',
      '      if ($LASTEXITCODE -ne 0) { throw "Capsule Toolbox installation or verification failed (exit $LASTEXITCODE)." }',
      '    runas: currentUserElevated',
      '    wait: true',
      '    errorAction: Halt',
      '    option: "install-capsule-toolbox"',
      '    weight: 150',
    );
  }
  return `${lines.join('\n')}\n`;
}

function featurePages(tweaks, defaultTweakIds, includeToolboxInstaller, extras = null) {
  const defaults = new Set(defaultTweakIds);
  const pages = [];
  for (const [category, title] of Object.entries(CATEGORIES)) {
    const group = tweaks.filter((entry) => entry.category === category);
    if (!group.length) continue;
    const pageCount = Math.ceil(group.length / 4);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageEntries = group.slice(pageIndex * 4, pageIndex * 4 + 4);
      const pageLabel = pageCount === 1 ? title : `${title} (${pageIndex + 1}/${pageCount})`;
      const options = pageEntries.map((entry) => `      <CheckboxOption IsChecked="${defaults.has(entry.id)}">
        <Text>${escapeXml(entry.title)}</Text>
        <Name>capsule-${escapeXml(entry.id)}</Name>
      </CheckboxOption>`).join('\n');
      pages.push(`    <CheckboxPage Description="Choose up to four ${escapeXml(pageLabel)} settings to apply. Unchecked settings are skipped.">
      <Options>
${options}
      </Options>
    </CheckboxPage>`);
    }
  }
  if (extras?.repair) {
    pages.push(`    <CheckboxPage Description="Add the CapsuleOS repair toolkit: a Repair Windows shortcut that runs the built-in DISM and SFC tools when you need them.">
      <Options>
        <CheckboxOption IsChecked="true">
          <Text>Install the Repair Windows toolkit</Text>
          <Name>capsule-repair-toolkit</Name>
        </CheckboxOption>
      </Options>
    </CheckboxPage>`);
  }
  if (extras?.browsers.length) {
    const options = extras.browsers.map((browser) => `        <RadioImageOption>
          <Text>${escapeXml(browser.text)}</Text>
          <Name>browser-${escapeXml(browser.id)}</Name>
          <FileName>${escapeXml(browser.id)}</FileName>
          <GradientTopColor>${browser.top}</GradientTopColor>
          <GradientBottomColor>${browser.bottom}</GradientBottomColor>
        </RadioImageOption>`).join('\n');
    pages.push(`    <RadioImagePage CheckDefaultBrowser="false" DefaultOption="browser-${escapeXml(extras.browsers[0].id)}" Description="Pick the browser CapsuleOS installs from its publisher through winget. Choosing Edge also brings it back if another playbook removed or blocked it.">
      <TopLine Text="Choose your browser"/>
      <Options>
        <RadioImageOption None="true"/>
${options}
      </Options>
      <BottomLine Text="Set it as default afterwards in Settings, Apps, Default apps"/>
    </RadioImagePage>`);
  }
  const packs = extras?.packs || [];
  for (let index = 0; index < packs.length; index += 4) {
    const pageCount = Math.ceil(packs.length / 4);
    const options = packs.slice(index, index + 4).map((pack) => `        <CheckboxOption IsChecked="false">
          <Text>${escapeXml(pack.name)}</Text>
          <Name>pack-${escapeXml(pack.id)}</Name>
        </CheckboxOption>`).join('\n');
    pages.push(`    <CheckboxPage Description="Environment Capsules (${index / 4 + 1}/${pageCount}): optional app packs installed from their publishers with winget. Nothing is installed unless checked.">
      <Options>
${options}
      </Options>
    </CheckboxPage>`);
  }
  if (includeToolboxInstaller) {
    pages.push(`    <CheckboxPage Description="Optionally install Capsule Toolbox with its local runtime and both approved offline models. The complete payload is included and is skipped unless selected.">
      <Options>
        <CheckboxOption IsChecked="false">
          <Text>Install Capsule Toolbox for my Windows account</Text>
          <Name>install-capsule-toolbox</Name>
        </CheckboxOption>
      </Options>
    </CheckboxPage>`);
  }
  return pages.join('\n');
}

function playbookConf(tweaks, version, defaultTweakIds, includeToolboxInstaller, extras = null) {
  const details = tweaks.map((entry) => `- ${entry.title}: ${entry.description}`).join('\n');
  const shortDescription = extras
    ? 'Restore point first, reversible settings, your browser choice and optional winget app packs.'
    : 'Selectable, reversible Capsule OS settings with an optional Toolbox companion.';
  return `<?xml version="1.0" encoding="utf-8"?>
<Playbook>
  <Name>${extras ? 'CapsuleOSv2' : 'CapsuleOS'}</Name>
  <Username>Capsule OS</Username>
  <ShortDescription>${escapeXml(shortDescription)}</ShortDescription>
  <Title>${extras ? 'CapsuleOSv2 playbook' : 'Capsule OS playbook'}</Title>
  <Description>Reversible Windows tweaks selected in the Capsule Toolbox and governed by SI Core.</Description>
  <Details>${escapeXml(details)}</Details>
  <Version>${escapeXml(version)}</Version>
  <UniqueId>6f1c2a5e-3b7d-4e0a-9c41-5d2b8a7e1f90</UniqueId>
  <FeaturePages>
${featurePages(tweaks, defaultTweakIds, includeToolboxInstaller, extras)}
  </FeaturePages>
</Playbook>
`;
}

function unifiedReadme(extras) {
  if (!extras) return '';
  const packs = extras.packs.map((pack) => {
    const core = pack.apps.filter((app) => !app.optional).map((app) => app.name).join(', ');
    const optional = pack.apps.filter((app) => app.optional).map((app) => app.name).join(', ');
    return `- ${pack.name}: ${pack.role}\n  Installs: ${core || 'nothing by default'}${optional ? `\n  Optional extras (not installed by this playbook): ${optional}` : ''}`;
  }).join('\n');
  return `
## Test CapsuleOSv2
Extract CapsuleOSv2.zip. SHA256SUMS.txt lists hashes for the APBX, this README and manifest.json;
compare a file with Get-FileHash -Algorithm SHA256 before opening it.
Open CapsuleOSv2.apbx in AME Wizard in a disposable Windows VM with a snapshot first. Review each
selected setting and browser; app packs are opt-in. Test apply, account-matched baseline restore,
package removal and cancellation/failure paths there before considering use on a primary PC.
The APBX password is "malte". The ZIP is not an installer and does not contain a new desktop executable.

## Safety first
The first action, Executables/Start-CapsuleSession.ps1, runs before anything else and halts the playbook if it fails:
1. creates a System Restore point, or requires an existing point no older than 24 hours if Windows throttles creation;
   retries with System Restore enabled on the system drive if creation fails;
2. records the current value, or absence, of every registry value this playbook can touch
   (including the two Edge blocking policies) to %ProgramData%\\CapsuleOS\\Baselines\\<account SID>;
3. installs the care scripts to %ProgramData%\\CapsuleOS\\Scripts.
In an elevated PowerShell window under the same Windows account, preview restoration:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\CapsuleOS\\Scripts\\Restore-CapsuleBaseline.ps1" -WhatIf
Remove -WhatIf to restore, or add -Option capsule-no-tips to restore one option.
HKCU actions explicitly use scope: currentUser; no other users' hives are modified. A baseline from a different
account is rejected. Original values are retained across reruns and newly introduced targets are added.
The revert YAML restores selected options from this baseline instead of guessing Windows defaults.
Restoring all captured values can overwrite subsequent edits to those values: review -WhatIf first.
Package and session operations write receipts to %ProgramData%\\CapsuleOS\\Receipts; registry values are
recorded in the session baseline, not a separate receipt for each individual registry action.

## Browser choice
${extras.browsers.map((browser) => `- ${browser.name}`).join('\n')}
- Keep my current browser
The chosen browser is installed using its fixed winget id (Chocolatey only if winget is unavailable and Chocolatey is already installed).
Existing installations are kept; a failed winget install is not retried through a different manager.
Choosing Edge removes only the EdgeUpdate policy values other playbooks use to block it, recording them on
the receipt. Windows requires you to confirm a new default browser in Settings > Apps > Default apps.

## Environment Capsules (app packs)
Unchecked by default. Each installs its core apps with winget; per-app receipts retain completed installs even
if a later app fails. AME is notified of failures without stopping later packs. Uninstall-CapsulePack.ps1 removes
only apps positively recorded as newly installed by this pack, for this Windows account. Pre-existing apps and
old receipts without ownership evidence are never used to authorize removal. Successful removals retire that ownership.
Retry a pack from an elevated PowerShell window using the installed fixed script:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\CapsuleOS\\Scripts\\Install-CapsulePack.ps1" -Pack developer
Preview removal first:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramData\\CapsuleOS\\Scripts\\Uninstall-CapsulePack.ps1" -Pack developer -WhatIf
${packs}

## Repair toolkit
Adds "Repair Windows" shortcuts that run the built-in DISM and SFC repair tools on demand. It copies files and
creates shortcuts only. Uninstall-CapsuleRepair.ps1 removes it.

## Fixed scripts
Only fixed scripts are shipped; manifest.json lists payload SHA-256 hashes. App installers are downloaded by
winget or an already-installed Chocolatey. These packs need internet access and App Installer or Chocolatey.
No AI models, Toolbox executable or new native Windows application is bundled in this lean playbook.
Archive checks and mocked script tests do not establish AME Wizard acceptance, elevated install/restore
success or support for every Windows build. Validate those flows in a disposable Windows VM before release.
`;
}

function readme(tweaks, includeToolboxInstaller, extras = null) {
  const sections = Object.keys(CATEGORIES).map((category) => {
    const group = tweaks.filter((entry) => entry.category === category);
    if (!group.length) return '';
    return `## ${CATEGORIES[category]}\n${group.map((entry) => `- ${entry.title} (${entry.risk} risk${needsAdmin(entry) ? ', needs admin' : ''})`).join('\n')}\n`;
  }).filter(Boolean).join('\n');
  return `# ${extras ? 'CapsuleOSv2' : 'Capsule OS'} playbook

Generated by the Capsule Toolbox. Windows settings are declarative registry value definitions. Each setting is
offered as an AME Wizard checkbox and only checked items are applied. Nothing runs until you select and approve it.

Security features (Defender, Windows Update, Firewall, SmartScreen) are never touched, and no apps or services
are removed during apply. Configuration/Tasks/apply.yml sets the values; Configuration/Tasks/revert.yml ${extras ? 'restores selected values from your account baseline.' : "restores Windows' behaviour."}
Medium-risk tweaks and any marked "needs admin" change machine-wide settings. Review the list and keep a restore
point. The YAML follows AME Wizard's documented registry action style and must be tried in AME Wizard before you
rely on it. The archive is a password-protected 7z file (password "malte", which AME Wizard requires).
${includeToolboxInstaller ? '\nThe optional Capsule Toolbox installer and both approved local models are bundled in Executables and run only if you check the AME Wizard option. Keep Executables/models beside setup. Its fixed verification script runs as the signed-in user via currentUserElevated, checks the setup exit code, installed executable, bundled runtime and pinned model hashes, and halts on failure. No Browser app, system Node or model download is needed; Windows WebView2 is still required. WSL2 requires separate Linux prerequisites.' : ''}
The Capsule playbook icon is included as playbook.png at the archive root.
${unifiedReadme(extras)}
${sections}`;
}

function resolveExtras(options) {
  if (options.unified !== true) return null;
  const browserIds = options.browsers ?? BROWSERS.map((browser) => browser.id);
  if (!Array.isArray(browserIds) || new Set(browserIds).size !== browserIds.length) throw new Error('Browsers must be an array of unique browser ids.');
  const browsers = browserIds.map((id) => {
    const found = BROWSERS.find((browser) => browser.id === id);
    if (!found) throw new Error(`Unknown browser "${id}".`);
    return found;
  });
  const packs = options.packCatalog?.packs ?? [];
  if (options.packCatalog && options.packCatalog.format !== 'capsule-packs/1') throw new Error('Unsupported pack catalog.');
  if (!Array.isArray(packs)) throw new Error('Packs must be an array.');
  const idPattern = /^[a-z0-9-]+$/;
  const packageId = /^[A-Za-z0-9][A-Za-z0-9.+_-]{1,99}$/;
  const packIds = new Set();
  for (const pack of packs) {
    if (!idPattern.test(pack.id) || !Array.isArray(pack.apps) || !pack.apps.length) throw new Error(`Invalid pack "${pack.id}".`);
    if (packIds.has(pack.id)) throw new Error(`Duplicate pack "${pack.id}".`);
    packIds.add(pack.id);
    for (const app of pack.apps) {
      if (!app.winget && !app.choco) throw new Error(`App "${app.name}" in pack "${pack.id}" has no package id.`);
      if ([app.winget, app.choco].some((id) => id && !packageId.test(id))) throw new Error(`App "${app.name}" has an invalid package id.`);
    }
  }
  return { browsers, packs, repair: options.includeRepairToolkit !== false };
}

export function capsuleTargets(tweaks, includeEdge = false) {
  const targets = tweaks.flatMap((entry) => entry.values.map((value) => ({
    option: `capsule-${entry.id}`, root: value.root, path: value.path, name: value.name, type: value.type, apply: value.apply,
  })));
  if (includeEdge) {
    for (const name of ['InstallDefault', 'Install{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}']) {
      targets.push({ option: 'browser-edge', root: 'HKLM', path: 'SOFTWARE\\Policies\\Microsoft\\EdgeUpdate', name, type: 'REG_DWORD' });
    }
  }
  return targets;
}

export function buildPlaybook(options = {}) {
  const version = options.version || '0.1.0';
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Version must look like 1.2.3.');
  const tweaks = selectTweaks(options);
  const tweakIds = new Set(tweaks.map((entry) => entry.id));
  const defaultTweakIds = options.defaultTweakIds ?? tweaks.map((entry) => entry.id);
  if (!Array.isArray(defaultTweakIds) || defaultTweakIds.some((id) => !tweakIds.has(id))) {
    throw new Error('Default tweaks must be an array of included tweak ids.');
  }
  const includeToolboxInstaller = options.includeToolboxInstaller === true;
  const extras = resolveExtras(options);
  const applyYaml = actionsYaml(tweaks, 'apply', includeToolboxInstaller, extras);
  const files = {
    'playbook.conf': playbookConf(tweaks, version, defaultTweakIds, includeToolboxInstaller, extras),
    'Configuration/main.yml': `---\ntitle: 'Capsule OS'\ndescription: 'Apply the settings selected in AME Wizard.'\nprivilege: Admin\nactions:\n  - !task: {path: 'Tasks\\apply.yml'}\n`,
    'Configuration/apply.yml': applyYaml,
    'Configuration/Tasks/apply.yml': applyYaml,
    'Configuration/revert.yml': actionsYaml(tweaks, 'revert', false, extras),
    'Configuration/Tasks/revert.yml': actionsYaml(tweaks, 'revert', false, extras),
    'README.md': readme(tweaks, includeToolboxInstaller, extras),
  };
  if (extras) files['Executables/capsule-targets.json'] = `${JSON.stringify(capsuleTargets(tweaks, extras.browsers.some((browser) => browser.id === 'edge')), null, 2)}\n`;
  const manifest = {
    version,
    preset: options.preset || null,
    tweaks: tweaks.map((entry) => entry.id),
    defaultTweaks: [...defaultTweakIds],
    toolboxInstallerIncluded: includeToolboxInstaller,
    needsAdmin: tweaks.some(needsAdmin),
    mediumRisk: tweaks.filter((entry) => entry.risk === 'medium').length,
  };
  if (extras) {
    manifest.unified = true;
    manifest.releaseName = 'CapsuleOSv2';
    manifest.browsers = extras.browsers.map((browser) => browser.id);
    manifest.packs = extras.packs.map((pack) => pack.id);
    manifest.repairToolkit = extras.repair;
    manifest.scripts = [...PLAYBOOK_SCRIPTS];
  }
  files['manifest.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
  return { files, manifest };
}
