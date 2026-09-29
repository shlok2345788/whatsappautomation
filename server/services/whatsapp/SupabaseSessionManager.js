const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const extract = require('extract-zip');
const { supabase } = require('../supabaseClient');

const BUCKET_NAME = 'whatsapp_sessions';

class SupabaseSessionManager {
  static async uploadSession(companyId, sessionDir) {
    if (!supabase) return;
    if (!fs.existsSync(sessionDir)) return;

    const zipPath = `${sessionDir}.zip`;
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', async () => {
        try {
          const fileBuffer = fs.readFileSync(zipPath);
          const remotePath = `${companyId}/session.zip`;
          
          const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(remotePath, fileBuffer, {
              upsert: true,
              contentType: 'application/zip'
            });

          fs.unlinkSync(zipPath); // clean up local zip
          
          if (error) {
            console.error(`[SessionManager] Failed to upload session for ${companyId}:`, error);
            reject(error);
          } else {
            console.log(`[SessionManager] Successfully uploaded session for ${companyId}`);
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      });

      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(sessionDir, false);
      archive.finalize();
    });
  }

  static async downloadSession(companyId, targetDir) {
    if (!supabase) return false;
    const remotePath = `${companyId}/session.zip`;
    const zipPath = `${targetDir}.zip`;

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(remotePath);

      if (error) {
        if (error.message.includes('not found') || error.message.includes('Object not found')) {
          console.log(`[SessionManager] No remote session found for ${companyId}`);
          return false; // No session to download
        }
        throw error;
      }

      // Ensure parent directory exists
      if (!fs.existsSync(path.dirname(targetDir))) {
        fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      }

      // Write arrayBuffer to file
      const buffer = Buffer.from(await data.arrayBuffer());
      fs.writeFileSync(zipPath, buffer);

      // Extract
      await extract(zipPath, { dir: targetDir });
      fs.unlinkSync(zipPath); // clean up

      console.log(`[SessionManager] Successfully downloaded and extracted session for ${companyId}`);
      return true;
    } catch (err) {
      console.error(`[SessionManager] Error downloading session for ${companyId}:`, err);
      return false;
    }
  }

  static async deleteSession(companyId) {
    if (!supabase) return;
    const remotePath = `${companyId}/session.zip`;
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([remotePath]);
      
    if (error) {
      console.error(`[SessionManager] Error deleting remote session for ${companyId}:`, error);
    } else {
      console.log(`[SessionManager] Deleted remote session for ${companyId}`);
    }
  }
}

module.exports = SupabaseSessionManager;
