chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});
// Restrict credentials to extension contexts even if Chrome defaults change.
chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
