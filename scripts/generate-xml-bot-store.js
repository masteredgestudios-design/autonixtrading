const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const xmlbotsDir = path.join(projectRoot, 'xmlbots');
const publicDir = path.join(projectRoot, 'public');
const publicXmlBotsDir = path.join(publicDir, 'xmlbots');
const manifestPath = path.join(publicDir, 'xmlbot-manifest.json');

const metadataByFile = {
  'DIFFERS Exit Value.xml': {
    id: 'smart-digit-predictor',
    name: 'Smart Digit Predictor',
    description: 'Tracks recent digit outcomes and predicts the next differing digit using a pattern-based staking model.',
    strategy_type: 'Digits / Differs',
    market: 'Synthetic Index',
    symbol: '1HZ10V',
    tags: ['digits', 'differs', 'pattern-tracking'],
  },
  'least appearing digit differ.xml': {
    id: 'least-frequent-digit-differ',
    name: 'Least Frequent Digit Differ',
    description: 'Analyzes the least common recent digit and trades the opposite outcome to capture repeat-variance swings.',
    strategy_type: 'Digits / Differs',
    market: 'Synthetic Index',
    symbol: '1HZ25V',
    tags: ['digits', 'differ', 'frequency-analysis'],
  },
  'over 1 stake compound .xml': {
    id: 'compound-over-one-growth',
    name: 'Compound Over 1 Growth',
    description: 'Compounds stake progression while hunting over-1 outcomes and tightening trade risk around profit momentum.',
    strategy_type: 'Digits / Over',
    market: 'Synthetic Index',
    symbol: '1HZ100V',
    tags: ['over', 'compound-growth', 'risk-managed'],
  },
  'OVER 1.xml': {
    id: 'high-conviction-over-one',
    name: 'High-Conviction Over 1',
    description: 'Runs a focused over-1 digit strategy that reacts to recent profit swings and adjusts exposure around wins and losses.',
    strategy_type: 'Digits / Over',
    market: 'Synthetic Index',
    symbol: '1HZ100V',
    tags: ['over', 'profit-guard', 'momentum'],
  },
};

if (!fs.existsSync(xmlbotsDir)) {
  throw new Error(`Missing xmlbots directory: ${xmlbotsDir}`);
}

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(publicXmlBotsDir, { recursive: true });

const xmlFiles = fs
  .readdirSync(xmlbotsDir)
  .filter(file => file.toLowerCase().endsWith('.xml'))
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

const items = xmlFiles.map(fileName => {
  const fullPath = path.join(xmlbotsDir, fileName);
  const xml = fs.readFileSync(fullPath, 'utf8');
  const metadata = metadataByFile[fileName] || {
    id: fileName.replace(/\.xml$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: fileName.replace(/\.xml$/i, '').replace(/\s+/g, ' ').trim(),
    description: 'A built-in XML bot strategy from the library.',
    strategy_type: 'Custom',
    market: 'Synthetic Index',
    symbol: 'Custom',
    tags: ['custom'],
  };

  const publicXmlPath = path.join(publicXmlBotsDir, fileName);
  fs.copyFileSync(fullPath, publicXmlPath);

  return {
    ...metadata,
    file_name: fileName,
    xml,
  };
});

fs.writeFileSync(manifestPath, JSON.stringify(items, null, 2));

console.log(`Generated ${items.length} XML bot entries in ${manifestPath}`);
