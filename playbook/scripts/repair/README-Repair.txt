CapsuleOS - Windows Repair Toolkit
====================================

WHY THIS EXISTS
---------------
Windows can usually repair itself - the tools are built in, they
are just unfriendly. This toolkit puts them one double-click
away, in the order Microsoft recommends. It is part of the
CapsuleOS promise: this playbook never leaves you needing to
reinstall Windows.

WHAT YOU GOT
------------
Repair-Windows.cmd     The full repair. Double-click it, approve
                       the administrator prompt, and let it run.
Quick-SFC-Scan.cmd     A fast system-file check on its own.
Repair-Windows.ps1     The engine both shortcuts call.
Logs                   Every run writes a dated log to
                       C:\ProgramData\CapsuleOS\Repair\Logs                       Windows keeps deeper logs at
                       C:\Windows\Logs\DISM\dism.log and
                       C:\Windows\Logs\CBS\CBS.log

WHAT THE FULL REPAIR DOES
-------------------------
1. DISM /CheckHealth    A quick look at the component store -
                        the warehouse Windows keeps spare parts in.
2. DISM /ScanHealth     A deeper scan of that store.
3. DISM /RestoreHealth  Repairs the store itself, using Windows
                        Update as the parts source by default.
4. SFC /scannow         Verifies every protected system file and
                        replaces damaged ones from the (now
                        healthy) store. If SFC repairs files, the
                        script runs it once more to confirm.

A full pass can take 10-40 minutes. That is normal. Do not close
the window mid-run.

IF RESTOREHEALTH CANNOT DOWNLOAD PARTS
--------------------------------------
RestoreHealth needs clean components. If it fails, first just
check your connection and run the repair again. If you have
Windows installation media (USB or ISO), you can point DISM at
it instead, from an administrator PowerShell in this folder:

    .\Repair-Windows.ps1 -Source D:\sources

(use your media's drive letter).

WHAT THIS TOOLKIT NEVER DOES
----------------------------
It changes no settings, disables no features, and touches no
security. DISM and SFC are Microsoft's own repair tools; these
scripts simply run them in the right order and keep the receipts.
