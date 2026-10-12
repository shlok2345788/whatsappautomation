const { supabase } = require('../services/supabaseClient');

const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const previewMatches = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const [{ data: pdfs }, { data: contacts }, { data: previousSent }] = await Promise.all([
      supabase.from('pdf_files').select('*').eq('company_id', companyId),
      supabase.from('contacts').select('*').eq('company_id', companyId).eq('isValid', true),
      supabase.from('message_logs').select('*').eq('company_id', companyId).eq('status', 'Sent'),
    ]);

    const sentMap = new Set();
    (previousSent || []).forEach((log) => {
      sentMap.add(`${log.phone}_${log.pdfFilename}`);
    });

    const contactMap = new Map();
    const phoneMap = new Map();
    (contacts || []).forEach((contact) => {
      if (contact.name) {
        contactMap.set(normalizeString(contact.name), contact);
      }
      if (contact.mobile) {
        const cleanPhone = String(contact.mobile).replace(/\D/g, '');
        phoneMap.set(cleanPhone, contact);
        if (cleanPhone.length > 10) {
          phoneMap.set(cleanPhone.slice(-10), contact); // Match last 10 digits
        }
      }
    });

    const matched = [];
    const unmatched = [];
    let duplicateSentCount = 0;

    const updatePromises = [];

    for (const pdf of (pdfs || [])) {
      let matchedContact = null;

      if (pdf.matchedContactId) {
        matchedContact = (contacts || []).find((c) => String(c.id) === String(pdf.matchedContactId));
      }

      if (!matchedContact) {
        const pdfNormName = normalizeString(pdf.extractedName);
        const pdfCleanFilename = normalizeString((pdf.originalFilename || '').replace(/\.pdf$/i, ''));

        // Strategy 1: Exact match on extracted name or filename
        matchedContact = (pdfNormName ? contactMap.get(pdfNormName) : null) ||
                         (pdfCleanFilename ? contactMap.get(pdfCleanFilename) : null);

        // Strategy 2: Phone number match if filename contains phone digits
        if (!matchedContact) {
          const digitsInFilename = (pdf.originalFilename || '').replace(/\D/g, '');
          if (digitsInFilename.length >= 10) {
            for (const [phoneKey, contact] of phoneMap.entries()) {
              if (phoneKey.length >= 10 && digitsInFilename.includes(phoneKey)) {
                matchedContact = contact;
                break;
              }
            }
          }
        }

        // Strategy 3: Safe fuzzy suggestion ONLY — do not auto-match to prevent DPDP data leakage
        let suggestedContact = null;
        if (!matchedContact) {
          for (const [cNormName, contact] of contactMap.entries()) {
            if (!cNormName || cNormName.length < 3) continue;
            if (
              (pdfNormName && (cNormName.includes(pdfNormName) || pdfNormName.includes(cNormName))) ||
              (pdfCleanFilename && (cNormName.includes(pdfCleanFilename) || pdfCleanFilename.includes(cNormName)))
            ) {
              suggestedContact = contact;
              break;
            }
          }
        }
      }

      if (matchedContact) {
        updatePromises.push(
          supabase.from('pdf_files').update({ matchedContactId: matchedContact.id }).eq('id', pdf.id).eq('company_id', companyId)
        );

        const isAlreadySent = sentMap.has(`${matchedContact.mobile}_${pdf.originalFilename}`);
        if (isAlreadySent) duplicateSentCount++;

        matched.push({
          pdfId: pdf.id,
          pdfFilename: pdf.originalFilename,
          extractedName: pdf.extractedName,
          filePath: pdf.filePath,
          fileHash: pdf.fileHash,
          contactId: matchedContact.id,
          contactName: matchedContact.name,
          phone: matchedContact.mobile,
          alreadySent: isAlreadySent
        });
      } else {
        unmatched.push({
          pdfId: pdf.id,
          pdfFilename: pdf.originalFilename,
          extractedName: pdf.extractedName,
          filePath: pdf.filePath,
          fileHash: pdf.fileHash,
          suggestedContact: suggestedContact ? { id: suggestedContact.id, name: suggestedContact.name, mobile: suggestedContact.mobile } : null
        });
      }
    }

    await Promise.all(updatePromises);

    res.json({
      summary: {
        totalPdfs: (pdfs || []).length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        duplicateSentCount
      },
      matched,
      unmatched,
      contacts: (contacts || []).map((c) => ({ _id: c.id, id: c.id, name: c.name, mobile: c.mobile }))
    });
  } catch (error) {
    next(error);
  }
};

const confirmManualMatch = async (req, res, next) => {
  try {
    const { pdfId, contactId } = req.body;
    const companyId = req.companyId;

    const { data: pdf, error: pdfErr } = await supabase
      .from('pdf_files')
      .select('*')
      .eq('id', pdfId)
      .eq('company_id', companyId)
      .single();

    if (pdfErr || !pdf) {
      return res.status(404).json({ message: 'PDF file not found' });
    }

    if (contactId) {
      const { data: contact, error: contactErr } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('company_id', companyId)
        .single();

      if (contactErr || !contact) {
        return res.status(404).json({ message: 'Contact not found' });
      }

      await supabase.from('pdf_files').update({ matchedContactId: contact.id }).eq('id', pdf.id).eq('company_id', companyId);
    } else {
      await supabase.from('pdf_files').update({ matchedContactId: null }).eq('id', pdf.id).eq('company_id', companyId);
    }

    const { data: updatedPdf } = await supabase.from('pdf_files').select('*').eq('id', pdf.id).single();
    res.json({ message: 'Manual match updated successfully', pdf: updatedPdf });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  previewMatches,
  confirmManualMatch
};
