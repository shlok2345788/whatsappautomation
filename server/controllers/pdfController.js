const { supabase } = require('../services/supabaseClient');
const pdfService = require('../services/pdf/pdfService');

const scanFolder = async (req, res, next) => {
  try {
    const { folderPath, clearPrevious } = req.body;
    const companyId = req.companyId;

    if (!folderPath || typeof folderPath !== 'string') {
      return res.status(400).json({ message: 'Please specify a valid local folder path' });
    }

    const pdfsFound = pdfService.scanLocalFolder(folderPath.trim());
    const createdAt = new Date().toISOString();

    if (clearPrevious) {
      await supabase.from('pdf_files').delete().eq('company_id', companyId);
    }

    const rows = pdfsFound.map((item) => ({
      company_id: companyId,
      originalFilename: item.originalFilename,
      extractedName: item.extractedName,
      filePath: item.filePath,
      fileSize: item.fileSize,
      fileHash: item.fileHash,
      matchedContactId: null,
      createdAt,
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('pdf_files').insert(rows);
      if (error) throw error;
    }

    const { data: inserted } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('company_id', companyId)
      .order('originalFilename', { ascending: true });

    res.status(201).json({
      message: `Scanned and found ${(inserted || []).length} PDF files`,
      count: (inserted || []).length,
      pdfs: inserted || []
    });
  } catch (error) {
    next(error);
  }
};

const uploadFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No PDF files were uploaded' });
    }

    const { clearPrevious } = req.body;
    const companyId = req.companyId;
    const createdAt = new Date().toISOString();

    if (clearPrevious) {
      await supabase.from('pdf_files').delete().eq('company_id', companyId);
    }

    const rows = req.files.map((file) => ({
      company_id: companyId,
      originalFilename: file.originalname,
      extractedName: pdfService.extractNameFromFilename(file.originalname),
      filePath: file.path,
      fileSize: file.size,
      fileHash: pdfService.calculateFileHash(file.path),
      matchedContactId: null,
      createdAt,
    }));

    const { error } = await supabase.from('pdf_files').insert(rows);
    if (error) throw error;

    const { data: inserted } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('company_id', companyId)
      .order('originalFilename', { ascending: true });

    res.status(201).json({
      message: `Uploaded and processed ${(inserted || []).length} PDF files`,
      count: (inserted || []).length,
      pdfs: inserted || []
    });
  } catch (error) {
    next(error);
  }
};

const getPdfFiles = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { data: rows, error } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('company_id', companyId)
      .order('originalFilename', { ascending: true });

    if (error) throw error;

    const matchedContactIds = (rows || [])
      .map((row) => row.matchedContactId)
      .filter(Boolean);
    let contactsById = new Map();

    if (matchedContactIds.length > 0) {
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', matchedContactIds);
      if (contactsError) throw contactsError;
      contactsById = new Map((contacts || []).map((contact) => [String(contact.id), contact]));
    }

    const formatted = (rows || []).map((row) => {
      const contact = contactsById.get(String(row.matchedContactId));
      return {
        ...row,
        matchedContactId: row.matchedContactId && contact
          ? { id: row.matchedContactId, _id: row.matchedContactId, name: contact.name, mobile: contact.mobile }
          : null,
      };
    });

    res.json(formatted);
  } catch (error) {
    next(error);
  }
};

const deletePdfFiles = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { error } = await supabase
      .from('pdf_files')
      .delete()
      .eq('company_id', companyId);
    if (error) throw error;
    res.json({ message: 'All PDF records cleared' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  scanFolder,
  uploadFiles,
  getPdfFiles,
  deletePdfFiles
};
