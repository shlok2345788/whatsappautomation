const fs = require('fs');
const path = require('path');
const { supabase } = require('../supabaseClient');

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Remove an empty directory if safe (not the root uploads or pdfs dir).
 */
const cleanupEmptyDirectory = (dirPath, baseUploadsDir) => {
  try {
    const normalizedDir = path.resolve(dirPath);
    const normalizedBase = path.resolve(baseUploadsDir);
    const pdfsBase = path.join(normalizedBase, 'pdfs');

    if (normalizedDir === normalizedBase || normalizedDir === pdfsBase) {
      return;
    }

    if (fs.existsSync(normalizedDir)) {
      const files = fs.readdirSync(normalizedDir);
      if (files.length === 0) {
        fs.rmdirSync(normalizedDir);
      }
    }
  } catch (err) {
    // Ignore cleanup error for directory
  }
};

/**
 * Scan and clean up expired PDF documents and database records.
 *
 * @param {Object} options
 * @param {number} [options.retentionDays] - Retention threshold in days (defaults to PDF_RETENTION_DAYS or 30)
 * @param {string} [options.uploadsDir] - Root upload directory to clean
 * @param {boolean} [options.dryRun] - If true, identify files without deleting
 * @param {string} [options.companyId] - Optional tenant filter
 * @returns {Promise<Object>} Cleanup execution report
 */
const cleanupExpiredPdfs = async (options = {}) => {
  const envDays = parseInt(process.env.PDF_RETENTION_DAYS, 10);
  const retentionDays = options.retentionDays !== undefined
    ? Number(options.retentionDays)
    : (!isNaN(envDays) && envDays > 0 ? envDays : DEFAULT_RETENTION_DAYS);

  const dryRun = Boolean(options.dryRun);
  const baseUploadsDir = path.resolve(
    options.uploadsDir || process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads')
  );

  const cutoffTimeMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDateIso = new Date(cutoffTimeMs).toISOString();

  let query = supabase
    .from('pdf_files')
    .select('*');

  if (options.companyId) {
    query = query.eq('company_id', options.companyId);
  }

  const { data: allPdfs, error } = await query;
  if (error) {
    throw new Error(`Failed to query PDF records: ${error.message}`);
  }

  const expiredPdfs = (allPdfs || []).filter((pdf) => {
    const recordTime = new Date(pdf.createdAt || pdf.created_at).getTime();
    return !isNaN(recordTime) && recordTime < cutoffTimeMs;
  });

  const activePdfs = (allPdfs || []).filter((pdf) => {
    const recordTime = new Date(pdf.createdAt || pdf.created_at).getTime();
    return isNaN(recordTime) || recordTime >= cutoffTimeMs;
  });

  let deletedFilesCount = 0;
  let deletedRecordsCount = 0;
  let reclaimedBytes = 0;
  const errors = [];
  const processedDirs = new Set();

  for (const pdf of expiredPdfs) {
    if (pdf.filePath) {
      try {
        const resolvedPath = path.resolve(pdf.filePath);

        // Security check: ensure path is within uploads directory
        if (resolvedPath.startsWith(baseUploadsDir) && fs.existsSync(resolvedPath)) {
          const stats = fs.statSync(resolvedPath);
          reclaimedBytes += stats.size;

          if (!dryRun) {
            fs.unlinkSync(resolvedPath);
            processedDirs.add(path.dirname(resolvedPath));
          }
          deletedFilesCount++;
        }
      } catch (fileErr) {
        errors.push({ id: pdf.id, path: pdf.filePath, error: fileErr.message });
      }
    }

    if (!dryRun) {
      try {
        await supabase.from('pdf_files').delete().eq('id', pdf.id);
        deletedRecordsCount++;
      } catch (dbErr) {
        errors.push({ id: pdf.id, error: dbErr.message });
      }
    } else {
      deletedRecordsCount++;
    }
  }

  // Clean empty directories if not dryRun
  if (!dryRun) {
    for (const dir of processedDirs) {
      cleanupEmptyDirectory(dir, baseUploadsDir);
    }
  }

  return {
    scannedRecords: (allPdfs || []).length,
    activeRecords: activePdfs.length,
    expiredRecords: expiredPdfs.length,
    deletedFiles: deletedFilesCount,
    deletedRecords: deletedRecordsCount,
    reclaimedBytes,
    reclaimedMb: +(reclaimedBytes / (1024 * 1024)).toFixed(2),
    retentionDays,
    cutoffDate: cutoffDateIso,
    dryRun,
    errors
  };
};

/**
 * Get current retention status without performing deletions.
 */
const getRetentionStatus = async (options = {}) => {
  return cleanupExpiredPdfs({ ...options, dryRun: true });
};

let retentionIntervalTimer = null;

/**
 * Start periodic automated cleanup job.
 *
 * @param {number} intervalMs - Interval between cleanup runs (defaults to 24 hours)
 * @param {Object} [options] - Options passed to cleanupExpiredPdfs
 */
const startRetentionSchedule = (intervalMs = 24 * 60 * 60 * 1000, options = {}) => {
  if (retentionIntervalTimer) {
    clearInterval(retentionIntervalTimer);
  }

  retentionIntervalTimer = setInterval(async () => {
    try {
      const result = await cleanupExpiredPdfs(options);
      console.log(`[PDF Retention] Automated cleanup completed: ${result.deletedFiles} files removed (${result.reclaimedMb} MB reclaimed)`);
    } catch (err) {
      console.error('[PDF Retention] Automated cleanup error:', err.message);
    }
  }, intervalMs);

  if (retentionIntervalTimer.unref) {
    retentionIntervalTimer.unref();
  }

  return retentionIntervalTimer;
};

/**
 * Stop running periodic cleanup job.
 */
const stopRetentionSchedule = () => {
  if (retentionIntervalTimer) {
    clearInterval(retentionIntervalTimer);
    retentionIntervalTimer = null;
  }
};

module.exports = {
  cleanupExpiredPdfs,
  getRetentionStatus,
  startRetentionSchedule,
  stopRetentionSchedule,
  DEFAULT_RETENTION_DAYS
};
