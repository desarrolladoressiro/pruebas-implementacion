export const BANK_OPTIONS = [
  { value: '143', label: 'BANCO BRUBANK' },
  { value: '285', label: 'BANCO MACRO' },
  { value: '999', label: 'BANELCO' },
  { value: '269', label: 'BCO REP. ORIENTAL DEL URUGUAY' },
  { value: '015', label: 'ICBC' },
  { value: '408', label: 'EFECTIVO SI - COMPANIA FINANCIERA ARGENTINA' },
  { value: '389', label: 'BANCO COLUMBIA S.A.' },
  { value: '890', label: 'BANELCO' },
  { value: '810', label: 'BANCO SOL DIGITAL' },
  { value: '017', label: 'BBVA-BANCO FRANCES' },
  { value: '007', label: 'BANCO GALICIA' },
  { value: '259', label: 'ITAU ARGENTINA SA' },
  { value: '609', label: 'BANCO REBANKING' },
  { value: '158', label: 'BANCO OPENBANK' },
  { value: '299', label: 'BANCO COMAFI' },
  { value: '150', label: 'HSBC BANK ARGENTINA' },
  { value: '072', label: 'BANCO SANTANDER RIO S.A.' },
  { value: '034', label: 'PATAGONIA' },
  { value: '310', label: 'BANCO DEL SOL' },
  { value: '027', label: 'BANCO SUPERVIELLE S.A.' },
  { value: '338', label: 'BST' },
  { value: '510', label: 'INGRESO A PMC POR MAIL' },
  { value: '060', label: 'BANCO DEL TUCUMAN SA' }
] as const;

export const BANK_CODES: ReadonlyArray<string> = BANK_OPTIONS.map((item) => item.value);
