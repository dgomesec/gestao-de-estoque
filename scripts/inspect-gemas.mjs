import { read, utils } from 'xlsx'

const wb = read('data/Gemas-99ce34.xlsx')
console.log('Sheets:', wb.SheetNames)

const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = utils.sheet_to_json(sheet)

console.log(`Total de linhas: ${rows.length}`)
console.log(`Colunas: ${Object.keys(rows[0] || {}).join(', ')}`)
console.log('\nPrimeiras 3 linhas:')
console.log(JSON.stringify(rows.slice(0, 3), null, 2))
