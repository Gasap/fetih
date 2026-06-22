const fs = require('fs');

const en = JSON.parse(fs.readFileSync('resources/lang/en.json', 'utf8'));
const tr = JSON.parse(fs.readFileSync('resources/lang/tr.json', 'utf8'));

const missing = {};

function compareObjects(objEn, objTr, currentPath) {
    for (const key in objEn) {
        if (typeof objEn[key] === 'object' && objEn[key] !== null) {
            if (!objTr || typeof objTr[key] !== 'object') {
                missing[currentPath ? currentPath + '.' + key : key] = objEn[key];
            } else {
                compareObjects(objEn[key], objTr[key], currentPath ? currentPath + '.' + key : key);
            }
        } else {
            if (!objTr || !objTr.hasOwnProperty(key)) {
                missing[currentPath ? currentPath + '.' + key : key] = objEn[key];
            }
        }
    }
}

compareObjects(en, tr, '');

fs.writeFileSync('missing_tr.json', JSON.stringify(missing, null, 2));
console.log(`Found ${Object.keys(missing).length} missing keys at the root/nested levels.`);
