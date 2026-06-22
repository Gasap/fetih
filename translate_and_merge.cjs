const fs = require('fs');
const translate = require('google-translate-api-x');

async function main() {
    const en = JSON.parse(fs.readFileSync('resources/lang/en.json', 'utf8'));
    const trPath = 'resources/lang/tr.json';
    const tr = JSON.parse(fs.readFileSync(trPath, 'utf8'));
    
    // Read the missing keys we generated earlier
    const missingKeys = JSON.parse(fs.readFileSync('missing_tr.json', 'utf8'));
    const keys = Object.keys(missingKeys);
    
    console.log(`Translating ${keys.length} keys to Turkish...`);
    
    let translatedCount = 0;

    for (const key of keys) {
        const textToTranslate = missingKeys[key];
        
        try {
            const res = await translate(textToTranslate, { to: 'tr' });
            let translatedText = res.text;
            
            // Set the translated text back into the nested object
            const parts = key.split('.');
            let current = tr;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            current[parts[parts.length - 1]] = translatedText;
            
            translatedCount++;
            if (translatedCount % 20 === 0) {
                console.log(`Translated ${translatedCount} / ${keys.length}`);
            }
        } catch (error) {
            console.error(`Failed to translate key: ${key}`, error.message);
        }
        
        // Small delay to avoid rate limit
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    fs.writeFileSync(trPath, JSON.stringify(tr, null, 2));
    console.log(`Successfully merged ${translatedCount} translated keys into tr.json`);
}

main();
