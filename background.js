
const kTST_ID = 'treestyletab@piro.sakura.ne.jp';


// #region Settings

const settings = getDefaultSettings();
let changed = {};
function applySettingChanges(target, changes, fallbackToDefault = true) {
  try {
    let defaultSettings = null;
    for (const [key, value] of Object.entries(changes)) {
      if ('newValue' in value) {
        target[key] = value.newValue;
      } else {
        if (fallbackToDefault) {
          if (!defaultSettings) {
            defaultSettings = getDefaultSettings();
          }
          target[key] = defaultSettings[key];
        } else {
          delete target[key];
        }
      }
    }
  } catch (error) {
    console.error('Failed to update settings!\n', error);
  }
}
browser.storage.onChanged.addListener((changes, areaName) => {
  applySettingChanges(settings, changes);
  if (changed) {
    applySettingChanges(changed, changes);
  } else {
    if (
      changes.detectDragAndDrop ||
      changes.detectCustomDrag ||
      changes.detectLongPressedTabs ||
      changes.preventDragAndDropAfterLongPress ||
      changes.preventDragAndDropAfterLongPress_Legacy
    ) {
      registerToTST();
    }
  }
});
const settingsLoaded = browser.storage.local.get(null).then((value) => {
  let changedKeys = Object.keys(changed);
  for (let key of Object.keys(value)) {
    if (!changedKeys.includes(key)) {
      settings[key] = value[key];
    }
  }
  changed = null;
});

// #endregion Settings


// #region Tree Style Tab

async function registerToTST() {
  try {
    await unregisterFromTST();

    const listeningTypes = ['ready', 'tab-mousedown', 'tab-mouseup'];

    if (settings.detectDragAndDrop) {
      listeningTypes.push('native-tab-dragstart'); // Drag and drop of tab started.
    }
    if (settings.detectCustomDrag) {
      listeningTypes.push('tab-dragstart');   // Drag and drop of tab was prevented in favour of custom drag handling by some addon.
    }
    if (settings.detectLongPressedTabs && settings.preventDragAndDropAfterLongPress && settings.preventDragAndDropAfterLongPress_Legacy) {
      listeningTypes.push('tab-dragready');   // If tab is long pressed (time is configured from TST's hidden debug settings and defaults to 400ms) than prevent drag and drop in favour of custom drag handling.      
    }

    const registrationDetails = {
      type: 'register-self',
      name: browser.runtime.getManifest().name,
      listeningTypes,
    };
    await browser.runtime.sendMessage(kTST_ID, registrationDetails);
  } catch (error) { return false; }
  return true;
}
async function unregisterFromTST() {
  try {
    await browser.runtime.sendMessage(kTST_ID, {
      type: 'unregister-self'
    });
  }
  catch (e) {
    // TST is not available
    return false;
  }
  return true;
}

// #endregion Tree Style Tab


// #region Handle Tree Style Tab Event

let lastResolve = null;
let longPressTimeoutId = null;
function resolveAs(value) {
  if (lastResolve && typeof lastResolve === 'function') {
    lastResolve(value);
  }
  lastResolve = null;

  if (longPressTimeoutId !== null) {
    clearTimeout(longPressTimeoutId);
  }
  longPressTimeoutId = null;
}

let lastMessage;
let lastPromise;
function handleLongPress(preventDragAndDrop, preventActive) {
  if (preventDragAndDrop) {
    browser.runtime.sendMessage(kTST_ID, { type: 'start-custom-drag', windowId: lastMessage.windowId });
  }
  if (preventActive) {
    const resolve = lastResolve;
    if (resolve) {
      lastResolve = () => resolve(true);
    }
  } else {
    resolveAs(false);
  }
}

browser.runtime.onMessageExternal.addListener((message, sender) => {
  if (sender.id !== kTST_ID) {
    return;
  }
  switch (message.type) {
    case 'ready': {
      // passive registration for secondary (or after) startup:
      registerToTST();
      return Promise.resolve(true);
    } break;
    case 'tab-mousedown': {
      if (message.button !== 0) {
        break;
      }
      lastPromise = null;
      resolveAs(true);  // Ensure last click doesn't select a tab.
      if (message.closebox || message.soundButton || message.twisty) {
        break;
      }
      if (settings.preventOnlyForUnloadedTabs && !message.tab.discarded) {
        break;
      }
      const aPromise = new Promise((resolve, reject) => {
        resolveAs(true);
        lastResolve = (value) => {
          if (value) {
            // If block tab select then wait to notify TST about it since that can cause issues with users of the drag APIs such as Multiple Tab Handler.
            // This shouldn't make a difference to the user since tab select is blocked while TST waits for the response anyway.
            setTimeout(() => resolve(value), 5000);
          } else {
            resolve(value);
          }
        };
        lastMessage = message;
        if (
          settings.detectLongPressedTabs &&
          // Not using legacy long press detection:
          !(settings.preventDragAndDropAfterLongPress && settings.preventDragAndDropAfterLongPress_Legacy)
        ) {
          longPressTimeoutId = setTimeout(() => {
            longPressTimeoutId = null;
            if (settings.detectLongPressedTabs) {
              handleLongPress(settings.preventDragAndDropAfterLongPress && !settings.preventDragAndDropAfterLongPress_Legacy, settings.preventLongPressedTabs);
            }
          }, settings.longPressTimeInMilliseconds);
        }
      });
      lastPromise = aPromise;
      return aPromise;
    } break;
    case 'tab-mouseup': {
      if (message.button !== 0) {
        break;
      }
      const releasedWithoutMove = lastMessage && message.tab.id === lastMessage.tab.id;
      const aPromise = lastPromise;
      lastPromise = null;
      resolveAs(!releasedWithoutMove);
      if (aPromise) {
        return aPromise;
      }
    } break;
    case 'native-tab-dragstart': {
      // Drag and drop of tab started (available in TST 2.7.8 and later):
      if (!settings.detectDragAndDrop) {
        break;
      }
      resolveAs(settings.preventDragAndDroppedTabs);  // Prevent tab from becoming active.
    } break;
    case 'tab-dragready': {
      if (!settings.detectLongPressedTabs || !settings.preventDragAndDropAfterLongPress || !settings.preventDragAndDropAfterLongPress_Legacy) {
        break;
      }
      handleLongPress(true, settings.preventLongPressedTabs);
    } break;
    case 'tab-dragstart': {
      // Drag and drop of tab was prevented in favour of custom drag handling by some addon and mouse has moved over to another tab:
      if (!settings.detectCustomDrag) {
        break;
      }
      resolveAs(settings.preventCustomDraggedTabs);  // Prevent tab from becoming active.
    } break;
  }
  return Promise.resolve(false);
});

// #endregion Handle Tree Style Tab Event


settingsLoaded.finally(() => {
  // aggressive registration on initial installation:
  if (!registerToTST()) {
    setTimeout(registerToTST, 5000);
  }
});
