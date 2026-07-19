import { read, utils } from 'xlsx'
import fs from 'fs'

// Inspecionar primeiro arquivo
console.log('=== DG_Private_Collection_Master ===')
const wb1 = read('data/DG_Private_Collection_Master_145_Registros_v3-840728.xlsx')
console.log('Sheets:', wb1.SheetNames)
for (const sheet of wb1.SheetNames.slice(0, 3)) {
  console.log(`\n--- Sheet: ${sheet} ---`)
  const data = utils.sheet_to_json(wb1.Sheets[sheet]).slice(0, 3)
  console.log('Colunas:', Object.keys(data[0] || {}))
  console.log('Primeiras linhas:')
  console.log(JSON.stringify(data, null, 2))
}

// Inspecionar segundo arquivo
console.log('\n\n=== Inventario_Master_Esculturas ===')
const wb2 = read('data/Inventario_Master_Esculturas_DG_Private_Collection-aac727.xlsx')
console.log('Sheets:', wb2.SheetNames)
for (const sheet of wb2.SheetNames.slice(0, 3)) {
  console.log(`\n--- Sheet: ${sheet} ---`)
  const data = utils.sheet_to_json(wb2.Sheets[sheet]).slice(0, 3)
  console.log('Colunas:', Object.keys(data[0] || {}))
  console.log('Primeiras linhas:')
  console.log(JSON.stringify(data, null, 2))
}
