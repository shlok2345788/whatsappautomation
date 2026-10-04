const xlsx = require('xlsx');
const fs = require('fs');

const normalizePhoneNumber = (rawNumber) => {
  if (rawNumber === null || rawNumber === undefined || rawNumber === '') {
    return { mobile: '', isValid: false, reason: 'Empty mobile number' };
  }
  
  let str = String(rawNumber).trim();
  // Strip spaces, dashes, parentheses, dots
  let digitsOnly = str.replace(/[^\d+]/g, '');
  
  if (digitsOnly.startsWith('+')) {
    digitsOnly = digitsOnly.substring(1);
  }

  // 10 digits starting with 6, 7, 8, 9 -> prepend 91
  if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
    return { mobile: '91' + digitsOnly, isValid: true, reason: 'Valid' };
  }
  
  // 11 digits starting with 0 followed by 6, 7, 8, 9 -> 91 + 10 digits
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0') && /^[6-9]/.test(digitsOnly.substring(1))) {
    return { mobile: '91' + digitsOnly.substring(1), isValid: true, reason: 'Valid' };
  }
  
  // 12 digits starting with 91 followed by 6, 7, 8, 9 -> valid Indian
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91') && /^[6-9]/.test(digitsOnly.substring(2))) {
    return { mobile: digitsOnly, isValid: true, reason: 'Valid' };
  }

  // Generic international length check (10 to 15 digits)
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return { mobile: digitsOnly, isValid: true, reason: 'Valid' };
  }

  return { mobile: digitsOnly || str, isValid: false, reason: 'Invalid mobile number format' };
};

const parseExcelFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('Uploaded Excel file could not be found');
  }

  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('Excel file does not contain a readable worksheet');
  }
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert sheet to json array of arrays to find header row
  const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows || rows.length === 0) {
    throw new Error('Excel file is empty');
  }

  let headerRowIndex = 0;
  let nameColIndex = -1;
  let mobileColIndex = -1;

  // Header detection regex patterns
  const namePattern = /name|person|student|client|customer|full\s*name/i;
  const mobilePattern = /mobile|phone|contact|number|whatsapp|cell/i;

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    let nIdx = -1;
    let mIdx = -1;

    row.forEach((cell, colIdx) => {
      const val = String(cell).trim();
      if (namePattern.test(val) && nIdx === -1) {
        nIdx = colIdx;
      }
      if (mobilePattern.test(val) && mIdx === -1) {
        mIdx = colIdx;
      }
    });

    if (nIdx !== -1 && mIdx !== -1) {
      headerRowIndex = i;
      nameColIndex = nIdx;
      mobileColIndex = mIdx;
      break;
    }
  }

  // Fallback: If no clear header detected, assume column 0 is Name and column 1 is Mobile
  if (nameColIndex === -1 || mobileColIndex === -1) {
    nameColIndex = 0;
    mobileColIndex = 1;
  }

  const records = [];
  const phoneSeen = new Set();

  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const rawName = String(row[nameColIndex] || '').trim();
    const rawMobile = String(row[mobileColIndex] || '').trim();

    // Skip totally empty rows
    if (!rawName && !rawMobile) continue;

    const norm = normalizePhoneNumber(rawMobile);
    
    let statusMessage = norm.reason;
    let isValid = norm.isValid;

    if (!rawName) {
      isValid = false;
      statusMessage = 'Missing person name';
    } else if (isValid) {
      if (phoneSeen.has(norm.mobile)) {
        statusMessage = 'Duplicate number in file';
        duplicateCount++;
      } else {
        phoneSeen.add(norm.mobile);
        validCount++;
      }
    }

    if (!isValid && statusMessage !== 'Duplicate number in file') {
      invalidCount++;
    }

    records.push({
      name: rawName,
      mobile: norm.mobile,
      originalMobile: rawMobile,
      isValid: isValid && statusMessage === 'Valid',
      statusMessage: statusMessage
    });
  }

  return {
    totalRecords: records.length,
    validCount,
    duplicateCount,
    invalidCount,
    records
  };
};

module.exports = {
  parseExcelFile,
  normalizePhoneNumber
};
