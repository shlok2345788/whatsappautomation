const fs = require('fs');
const path = require('path');
const { supabase } = require('../services/supabaseClient');
const pdfService = require('../services/pdf/pdfService');

const downloadPdfFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const companyId = req.companyId;

    const { data: pdf, error } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (error || !pdf) {
      return res.status(404).json({ message: 'PDF document not found or access denied' });
    }

    const resolvedPath = path.resolve(pdf.filePath);
    const uploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));

    // Prevent directory traversal attacks
    if (!resolvedPath.startsWith(uploadsDir)) {
      return res.status(403).json({ message: 'Access denied: Invalid file location' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ message: 'File not found on storage disk' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(pdf.originalFilename)}"`);
    const stream = fs.createReadStream(resolvedPath);
    stream.pipe(res);
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
  downloadPdfFile,
  uploadFiles,
  getPdfFiles,
  deletePdfFiles
};
