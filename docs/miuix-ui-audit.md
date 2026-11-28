# Miuix visual layer — source audit
Baseline: main b88158420da6852150817382cd851952d17ac832 (3.0.40).
This is a Vue/Vuetify adaptation, not the native Compose Miuix library.
Reference: https://compose-miuix-ui.github.io/miuix/components/index
## Page coverage (source inspected; runtime verification pending)
- App.vue: router list, overview (water metrics, charts, detector, resources), network WAN/LAN and details, terminal list and status, statistics, tools hub and favorites, WOL, settings, privacy, refresh, language, help and about.
- SavedRouterCard, TerminalDeviceCard, NetworkHardwareList, NetworkInterfacesPanel, RealtimeChart, TrendChartPanel, SecurityDashboard.
- RouterAppsPanel (SSR+, WeChat Push, detector, Carbon, ZeroTier, firewall etc.), AppFilterPanel, LuckyPanel, VlmcsdPanel, SoftwarePackagesPanel, RouterOperationsPanel, AdvancedManagementPanel, CompactManagementLists, LabPanel, AboutPage.
- Shared surfaces, lists, fields, switches, buttons, segmentation, navigation and overlays use root-scoped theme. Semantic status colors, chart data, water animation and existing layouts remain.
## Dialog inventory (33 Vue v-dialog instances)
| Source | Models |
|---|---|
| App.vue (16) | favoriteEditorOpen, versionDetailsDialog, privacyDialog, selectedClient (fullscreen on phones), hqosGlobalDialog, hqosGlobalConfirm, qosWriteConfirm, deviceDialog, xiaomiDialog, loginDialog, deleteDialog, wolDeleteDialog, factoryDialog, confirmReboot, releaseNotesDialog, updateDialog |
| AdvancedManagementPanel (2) | cronEditing, queued |
| LabPanel (1) | resetConfirmation |
| OpenSourceLicensesDialog (1) | visible |
| NetworkInterfacesPanel (2) | editorOpen (fullscreen on phones), runtimeTarget |
| SoftwarePackagesPanel (4) | actionDialog, outputDialog, configDialog, configSaveConfirm |
| RouterAppsPanel (5) | ssrComponentDialog, carbonUpgradeDialog, ztDeleteDialog, fwRuleConfirm, fwDeleteDialog |
| RouterOperationsPanel (2) | recordDelete, serviceConfirm |
Also terminalDisplayMenuOpen, Vuetify select menus and snackbar. The HTML root selector reaches all teleports. Fullscreen editors keep their edge-to-edge geometry, scroll and action bars; persistent dialogs keep their existing guards. Android native system bars receive the current style, preserving inset ownership.
## Manual acceptance (not executed)
- Switch in Settings > Display and appearance; immediate updates, reload persistence, default Material, light/dark/system and standard/liquid bottom nav independently.
- Walk every page and every dialog listed above in light/dark. Verify 360px/412px phone and tablet, long names, long translated labels, scrolling, keyboard, back, destructive confirmation, loading, disabled states and online/offline indicators.
- Verify native system bars, Android gesture back, safe areas, and reduced motion.
- Compare default Material with baseline. No new dependency, no RPC changes, no version bump or release until verified.

## Round 2: explicit dialog roles
All 33 instances now have a unique instance class and a role: 16 confirmations, 10 forms, 5 information dialogs, 2 fullscreen editors.
- Confirmations bottom-align in portrait phones; centered on larger screens; balanced actions, preserving warning/danger semantics and persistent guards.
- Forms remain centered to avoid keyboard overlap; multi-button actions wrap. Information dialogs retain scrolling and multiple actions. Fullscreen editors preserve original dimensions and scroll ownership.
- Root dark tokens now cover detached overlays. Narrow generic card styles avoid recoloring semantic cards; network groups, terminal filters, water tiles, app groups and liquid navigation receive targeted rules.
- References: https://compose-miuix-ui.github.io/miuix/components/basic/card and https://compose-miuix-ui.github.io/miuix/components/basic/overlaydialog . Native card radius 16dp; compact bottom dialogs and centered large-screen dialogs adapted to WebView.
- Round 1 CI passed; round 2 build and actual runtime/visual validation pending.

## Round 3
Source-specific rules added for SSR+, WeChat Push, detector, ZeroTier, firewall, Lucky, Vlmcsd, packages, AppFilter, advanced management, lab, about and compact management lists. Round 2 CI passed. Runtime screenshot review remains unverified.

## Round 4: screenshot diagnostic
The existing smoke test optionally collects actual screenshots in isolated light/dark mock RPC browser contexts on the feature PR. It reports each screenshot, observed dialog IDs, layout width, theme, missed steps and page errors. Existing web prototype CI artifact includes dist/miuix-audit/manifest.json and screenshots. Unseen dialogs remain unverified; screenshots must be reviewed before declaring visual acceptance.
## Round 5: release candidate
Stage v3.0.41 with release notes; retain main unchanged until latest CI and visual acceptance. No APK has been published for this candidate.
