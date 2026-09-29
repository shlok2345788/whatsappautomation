const { supabase } = require('../services/supabaseClient');

const getSettings = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    const { data: settings, error } = await supabase
      .from('settings')
      .select('*')
      .eq('company_id', companyId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!settings) {
      // Should have been auto-created by the DB trigger, but create as fallback
      const defaultTpl = "Hello {{name}},\n\nPlease find your document attached.\n\nThank you.";
      const { data: created, error: insertErr } = await supabase
        .from('settings')
        .insert({ company_id: companyId, delayBetweenMessages: 4, messageTemplate: defaultTpl, autoRetryFailed: false })
        .select()
        .single();
      if (insertErr) throw insertErr;
      return res.json(created);
    }

    res.json(settings);
  } catch (error) {
    next(error);
  }
};

const updateSettings = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { delayBetweenMessages, messageTemplate, autoRetryFailed } = req.body;

    const updates = {};
    if (delayBetweenMessages !== undefined) updates.delayBetweenMessages = Number(delayBetweenMessages);
    if (messageTemplate !== undefined) updates.messageTemplate = messageTemplate;
    if (autoRetryFailed !== undefined) updates.autoRetryFailed = Boolean(autoRetryFailed);
    updates.updatedAt = new Date().toISOString();

    const { data: updated, error } = await supabase
      .from('settings')
      .upsert({ company_id: companyId, ...updates }, { onConflict: 'company_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Settings updated successfully', settings: updated });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { name, email, currentPassword, newPassword } = req.body;

    // Update Supabase Auth user metadata and/or email/password
    const authUpdates = {};
    if (email) authUpdates.email = email;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to set a new password' });
      }
      authUpdates.password = newPassword;
    }
    if (name) {
      authUpdates.data = { company_name: name };
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabase.auth.admin.updateUserById(companyId, authUpdates);
      if (authError) throw authError;
    }

    // Update the companies table
    const companyUpdates = {};
    if (name) companyUpdates.company_name = name;
    if (email) companyUpdates.email = email;

    if (Object.keys(companyUpdates).length > 0) {
      const { data: updatedCompany, error } = await supabase
        .from('companies')
        .update(companyUpdates)
        .eq('id', companyId)
        .select('id, company_name, email, created_at')
        .single();

      if (error) throw error;
      return res.json({ message: 'Profile updated successfully', user: updatedCompany });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  updateProfile
};
