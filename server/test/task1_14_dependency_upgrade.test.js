const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const { parseExcelFile, normalizePhoneNumber } = require('../services/excel/excelService');

test('Task 1.14 — Upgrade Vulnerable Dependencies Suite', async (t) => {
  const tempDir = path.join(os.tmpdir(), 'excel_upgrade_test_' + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  t.after(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  });

  await t.test('1. Verify vulnerable xlsx package is removed from dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    assert.equal(pkg.dependencies.xlsx, undefined, 'Vulnerable xlsx package must not be in package.json');
    assert.ok(pkg.dependencies.exceljs, 'exceljs must be installed in package.json');
  });

  await t.test('2. ExcelJS generates and parses multi-row spreadsheets accurately', async () => {
    const filePath = path.join(tempDir, 'sample_contacts.xlsx');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Customers');

    worksheet.addRow(['Customer Name', 'Mobile Number']);
    worksheet.addRow(['Rajesh Kumar', '9876543210']);
    worksheet.addRow(['Anita Sharma', '+91 91234 56789']);
    worksheet.addRow(['Duplicate Person', '9876543210']); // Duplicate number
    worksheet.addRow(['', '9998887776']); // Missing name
    worksheet.addRow(['Invalid Phone User', '12345']); // Invalid phone

    await workbook.xlsx.writeFile(filePath);

    const result = await parseExcelFile(filePath);

    assert.equal(result.totalRecords, 5);
    assert.equal(result.validCount, 2, 'Should have 2 valid contacts');
    assert.equal(result.duplicateCount, 1, 'Should detect 1 duplicate number');
    assert.equal(result.invalidCount, 2, 'Should detect 2 invalid contacts');

    const validNames = result.records.filter((r) => r.isValid).map((r) => r.name);
    assert.deepEqual(validNames, ['Rajesh Kumar', 'Anita Sharma']);
  });

  await t.test('3. Phone normalization handles multiple international and Indian formats', () => {
    assert.equal(normalizePhoneNumber('9876543210').mobile, '919876543210');
    assert.equal(normalizePhoneNumber('09876543210').mobile, '919876543210');
    assert.equal(normalizePhoneNumber('+919876543210').mobile, '919876543210');
    assert.equal(normalizePhoneNumber('+14155552671').mobile, '14155552671');
    assert.equal(normalizePhoneNumber('invalid').isValid, false);
    assert.equal(normalizePhoneNumber('').isValid, false);
  });

  await t.test('4. Empty Excel file throws clear descriptive error', async () => {
    const emptyFile = path.join(tempDir, 'empty.xlsx');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Empty');
    await workbook.xlsx.writeFile(emptyFile);

    await assert.rejects(
      async () => await parseExcelFile(emptyFile),
      /Excel file is empty/i
    );
  });
});
