const fs = require('fs');
const http = require('http');
const { Command } = require('commander');
const { XMLBuilder } = require('fast-xml-parser');
const program = new Command();


program.configureOutput({
  writeOut: () => {},
  writeErr: () => {}
});

program
  .requiredOption('-i, --input <file>', 'input file')
  .option('-o, --output <file>', 'output file')
  .option('-d, --display', 'display output to console')
  .option('-a, --airtime <number>', 'show only flights with AIR_TIME longer than value', parseFloat)
  .option('-t, --date', 'show FL_DATE before AIR_TIME and DISTANCE')
  .option('--host <host>', 'HTTP server host (optional)')
  .option('--port <port>', 'HTTP server port (optional)');

program.exitOverride();

try {
  program.parse(process.argv);
} catch (err) {
  
}

const opts = program.opts();


if (!opts.input) {
  console.error('Please, specify input file');
  process.exit(1);
}

if (process.argv.includes('-o') && !opts.output) {
  console.error('Please, specify output file path');
  process.exit(1);
}

if (process.argv.includes('-a') && (opts.airtime === undefined || Number.isNaN(opts.airtime))) {
  console.error('Please, specify airtime value');
  process.exit(1);
}

if (!fs.existsSync(opts.input)) {
  console.error('Cannot find input file');
  process.exit(1);
}


const raw = fs.readFileSync(opts.input, 'utf8').trim();
let data;

try {
  data = JSON.parse(raw);
  if (!Array.isArray(data)) data = [data];
} catch {
  try {
    data = raw.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  } catch {
    console.error('Invalid JSON format in input file');
    process.exit(1);
  }
}


function filterFlights(airtimeValue) {
  if (!airtimeValue || Number.isNaN(airtimeValue)) return data;
  return data.filter(item => item.AIR_TIME && item.AIR_TIME > airtimeValue);
}

function makeText(flights, showDate) {
  return flights
    .map(f => `${showDate ? f.FL_DATE + ' ' : ''}${f.AIR_TIME} ${f.DISTANCE}`)
    .join('\n');
}

function makeXml(flights, showDate) {
  const builder = new XMLBuilder({ format: true });
  const xmlData = flights.map(f => ({
    ...(showDate ? { date: f.FL_DATE } : {}),
    air_time: f.AIR_TIME,
    distance: f.DISTANCE
  }));
  return builder.build({ flights: { flight: xmlData } });
}


if (!opts.host || !opts.port) {
  const result = filterFlights(opts.airtime);
  const outputText = makeText(result, opts.date);

  if (opts.output) fs.writeFileSync(opts.output, outputText, 'utf8');
  if (opts.display) console.log(outputText);

  process.exit(0);
}


const HOST = opts.host;
const PORT = parseInt(opts.port, 10);

if (Number.isNaN(PORT)) {
  console.error('Port must be a number');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    const fullUrl = new URL(req.url, `http://${HOST}:${PORT}`);
    const dateFlag = fullUrl.searchParams.get('date') === 'true';
    const airtimeMin = fullUrl.searchParams.get('airtime_min')
      ? parseFloat(fullUrl.searchParams.get('airtime_min'))
      : null;

    const MAX_RESULTS = 1000; 
    const filtered = filterFlights(airtimeMin).slice(0, MAX_RESULTS);

    const xml = makeXml(filtered, dateFlag);

    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
  } catch (err) {
    console.error('Request error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://${HOST}:${PORT}/`);
  console.log(`📂 Using file: ${opts.input}`);
});
