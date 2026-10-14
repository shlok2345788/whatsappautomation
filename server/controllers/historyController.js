const { supabase } = require('../services/supabaseClient');
const messagingProvider = require('../services/messaging/messagingProvider');

const getHistory = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { status, search, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('message_logs')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('id', { ascending: false })
      .range((Number(page) - 1) * Number(limit), Number(page) * Number(limit) - 1);

    if (status && status !== 'All') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`contactName.ilike.%${search}%,phone.ilike.%${search}%,pdfFilename.ilike.%${search}%`);
    }

    const { data: logs, error, count } = await query;
    if (error) throw error;

    res.json({
      logs: logs || [],
      total: count || 0,
      page: Number(page),
      pages: Math.ceil((count || 0) / Number(limit))
    });
  } catch (error) {
    next(error);
  }
};

const retryMessage = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const logId = req.params.id;

    const { data: logEntry, error: fetchErr } = await supabase
      .from('message_logs')
      .select('*')
      .eq('id', logId)
      .eq('company_id', companyId)
      .single();

    if (fetchErr || !logEntry) {
      return res.status(404).json({ message: 'Message log not found' });
    }

    // Server-side authorization check: Re-verify recipient contact
    let recipientPhone = logEntry.phone;
    if (logEntry.contactId) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('mobile, isValid')
        .eq('id', logEntry.contactId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (contact && contact.mobile) {
        recipientPhone = contact.mobile;
      }
    }

    // Server-side authorization check: Re-verify PDF file record for this company
    const { data: pdfRow } = await supabase
      .from('pdf_files')
      .select('filePath')
      .eq('originalFilename', logEntry.pdfFilename)
      .eq('company_id', companyId)
      .maybeSingle();

    const resolvedPdfPath = pdfRow?.filePath || logEntry.pdfPath;
    const fs = require('fs');
    if (!resolvedPdfPath || !fs.existsSync(resolvedPdfPath)) {
      return res.status(404).json({ message: 'PDF document file is missing or inaccessible' });
    }

    const connection = await messagingProvider.checkConnection(companyId);
    if (connection.status !== 'CONNECTED') {
      return res.status(400).json({
        message: `WhatsApp Business API is not ready (${connection.message}). Please verify configuration.`
      });
    }

    await supabase.from('message_logs').update({ status: 'Sending' }).eq('id', logId);

    try {
      const sendResult = await messagingProvider.sendPdfDocument(
        companyId,
        recipientPhone,
        resolvedPdfPath,
        logEntry.pdfFilename,
        logEntry.messageText
      );

      const { data: updated } = await supabase
        .from('message_logs')
        .update({
          status: 'Sent',
          providerMessageId: sendResult?.messageId || '',
          sentAt: new Date().toISOString(),
          errorReason: ''
        })
        .eq('id', logId)
        .select()
        .single();

      res.json({ message: 'Message retried and sent successfully', log: updated });
    } catch (err) {
      const { data: updated } = await supabase
        .from('message_logs')
        .update({ status: 'Failed', errorReason: err.message || 'Retry failed' })
        .eq('id', logId)
        .select()
        .single();

      res.status(400).json({ message: `Retry failed: ${err.message}`, log: updated });
    }
  } catch (error) {
    next(error);
  }
};

const clearHistory = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { error } = await supabase
      .from('message_logs')
      .delete()
      .eq('company_id', companyId);
    if (error) throw error;
    res.json({ message: 'Message history cleared successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHistory,
  retryMessage,
  clearHistory
};
