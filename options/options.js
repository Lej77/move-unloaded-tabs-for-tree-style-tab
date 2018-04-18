
const messagePrefix = 'message_';


function setTextMessages(elementsToText = null) {
    if (!Array.isArray(elementsToText)) {
        rootElement = document;
        if (elementsToText) {
            rootElement = elementsToText;
        }
        elementsToText = Array.from(rootElement.querySelectorAll(`*[class*='${messagePrefix}']`));
        if (rootElement !== document) {
            elementsToText.push(rootElement);
        }
    }
    for (let i = 0; i < elementsToText.length; i++) {
        let ele = elementsToText[i];
        for (let c of ele.classList) {
            if (c.length > messagePrefix.length && c.startsWith(messagePrefix)) {
                let messageId = c.substring(messagePrefix.length);
                ele.textContent = browser.i18n.getMessage(messageId);
                break;
            }
        }
    }
}

function bindElementIdsToSettings(settings) {
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
        element.addEventListener('input', e => {
            let keyValue = {};
            keyValue[key] = e.target[propertyName];
            browser.storage.local.set(keyValue);
        });
    }
}

async function initiatePage() {
    setTextMessages();
    let allIdElements = document.querySelectorAll('[id]');
    let obj = {};
    for (let idElement of allIdElements) {
        obj[idElement.id] = idElement.type === 'checkbox' ? idElement.checked : idElement.value;
    }
    let settings = await browser.storage.local.get(obj);
    bindElementIdsToSettings(settings);
}
initiatePage();