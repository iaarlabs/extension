chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-panel") {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]?.id) {
      await chrome.sidePanel.open({tabId: tabs[0].id});
    }
  }
});