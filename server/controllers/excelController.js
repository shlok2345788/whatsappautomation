const { supabase } = require('../services/supabaseClient');
const excelService = require('../services/excel/excelService');
const fs = require('fs');

const uploadAndParseExcel = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file (.xlsx or .xls)' });
    }

    const filePath = req.file.path;
    const parsedData = excelService.parseExcelFile(filePath);

    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      // ignore cleanup error
    }

    res.json(parsedData);
  } catch (error) {
    next(error);
  }
};

const confirmImportContacts = async (req, res, next) => {
  try {
    const { contacts, replaceExisting } = req.body;
    const companyId = req.companyId;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: 'No valid contacts provided for import' });
    }

    const validContacts = contacts.filter((c) => c.isValid && c.name && c.mobile);
    if (validContacts.length === 0) {
      return res.status(400).json({ message: 'No valid contacts to insert' });
    }

    if (replaceExisting) {
      const { error: deleteErr } = await supabase
        .from('contacts')
        .delete()
        .eq('company_id', companyId);
      if (deleteErr) throw deleteErr;
    }

    const createdAt = new Date().toISOString();
    const rows = validContacts.map((item) => ({
      company_id: companyId,
      name: item.name.trim(),
      mobile: item.mobile.trim(),
      originalMobile: item.originalMobile || item.mobile,
      isValid: Boolean(item.isValid),
      statusMessage: 'Valid',
      createdAt,
    }));

    const { error: insertErr } = await supabase.from('contacts').insert(rows);
    if (insertErr) throw insertErr;

    res.status(201).json({
      message: `Successfully imported ${validContacts.length} contacts`,
      importedCount: validContacts.length
    });
  } catch (error) {
    next(error);
  }
};

const getContacts = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { data: rows, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(rows || []);
  } catch (error) {
    next(error);
  }
};

const deleteContact = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { data, error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', req.params.id)
      .eq('company_id', companyId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const deleteAllContacts = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('company_id', companyId);
    if (error) throw error;
    res.json({ message: 'All contacts deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadAndParseExcel,
  confirmImportContacts,
  getContacts,
  deleteContact,
  deleteAllContacts
};
