
const messagePrefix = 'message-';
const requiresPrefix = 'requires-';


function setTextMessages(elementsToText = null, { asHTML = true } = {}) {
    if (!Array.isArray(elementsToText)) {
        let rootElement = document;
        if (elementsToText) {
            rootElement = elementsToText;
        }
        elementsToText = Array.from(rootElement.querySelectorAll(`*[class*='${messagePrefix}']`));
        if (rootElement !== document) {
            elementsToText.push(rootElement);
        }
    }
    for (const ele of elementsToText) {
        for (const c of ele.classList) {
            if (c.length > messagePrefix.length && c.startsWith(messagePrefix)) {
                const messageId = c.substring(messagePrefix.length);
                const message = browser.i18n.getMessage(messageId);
                if (asHTML) {
                    ele.innerHTML = message;
                } else {
                    ele.textContent = message;
                }
                break;
            }
        }
    }
}

function bindElementIdsToSettings(settings, createListeners = true) {
    for (let key of Object.keys(settings)) {
        let element = document.getElementById(key);
        if (!element) {
            continue;
        }

        let propertyName;
        if (element.type === 'checkbox') {
            propertyName = 'checked';
        } else {
            propertyName = 'value';
        }

        element[propertyName] = settings[key];
        if (createListeners) {
            element.addEventListener('input', e => {
                const keyValue = {};
                let value = e.target[propertyName];
                if (element.type === 'number') {
                    value = parseInt(value);
                    if (isNaN(value))
                        return;
                }
                keyValue[key] = value;
                browser.storage.local.set(keyValue);
            });
        }
    }
}

function bindDependantSettings() {
    const requireObjs = [];
    const checkRequired = (affectedObject = null) => {
        for (const obj of requireObjs) {
            if (affectedObject && obj !== affectedObject) {
                continue;
            }
            const changed = obj.checkEnabled();
            if (changed) {
                return checkRequired();
            }
        }
    };

    const requireAreas = Array.from(document.querySelectorAll(`*[class*='${requiresPrefix}']`));
    for (const ele of requireAreas) {
        for (const c of ele.classList) {
            if (c.length > requiresPrefix.length && c.startsWith(requiresPrefix)) {
                let requireId = c.substring(requiresPrefix.length);
                let inverted = false;
                if (requireId.startsWith('!')) {
                    requireId = requireId.slice(1);
                    inverted = true;
                }

                const requiredElement = document.getElementById(requireId);
                let obj = {
                    listener: (e) => {
                        const changed = obj.checkEnabled();
                        if (changed) {
                            checkRequired();
                        }
                    },
                    checkEnabled: () => {
                        let enabled = false;
                        if (requiredElement.type === 'checkbox') {
                            enabled = requiredElement.checked;
                        } else if (requiredElement.type === 'number') {
                            let value = parseInt(requiredElement.value);
                            enabled = !isNaN(value) && value >= 0;
                        }
                        if (inverted) {
                            enabled = !enabled;
                        }
                        let eleToCheck = requiredElement;
                        while (eleToCheck) {
                            if (enabled) {
                                break;
                            }
                            if (eleToCheck.classList.contains('disabled')) {
                                enabled = true;
                            }
                            eleToCheck = eleToCheck.parentElement;
                        }

                        const was = ele.classList.contains('disabled');
                        if (was !== !enabled) {
                            ele.classList.toggle('disabled', !enabled);
                            return true;
                        }
                        return false;
                    },
                };
                requireObjs.push(obj);
                requiredElement.addEventListener('input', obj.listener);

                break;
            }
        }
    }
    return checkRequired;
}


async function initiatePage() {
    setTextMessages();
    const checkRequired = bindDependantSettings();

    const defaultSettings = getDefaultSettings();
    const settings = Object.assign({}, getDefaultSettings(), await browser.storage.local.get(null));

    let firstLoad = true;
    const handleLoad = () => {
        bindElementIdsToSettings(settings, firstLoad);
        checkRequired();

        firstLoad = false;
    };
    handleLoad();

    browser.storage.onChanged.addListener((changes, areaName) => {
        for (const [key, value] of Object.entries(changes)) {
            settings[key] = ('newValue' in value) ? value.newValue : defaultSettings[key];
        }
        checkRequired(changes);
    });

    document.getElementById('resetSettingsButton').addEventListener('click', async (e) => {
        let ok = confirm(browser.i18n.getMessage('options_resetSettings_Prompt'));
        if (!ok) {
            return;
        }

        // Clear settings:
        await browser.storage.local.clear();

        // Reload settings:
        setTimeout(handleLoad, 250);
    });
}
initiatePage();