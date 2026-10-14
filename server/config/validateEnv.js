/**
 * Environment configuration validator.
 * Enforces security constraints at startup:
 * 1. SIMULATION_MODE must never be true in production.
 * 2. Critical encryption and auth secrets must be set in production.
 */
const validateEnv = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isSimulationExplicit = process.env.SIMULATION_MODE === 'true';

  if (isProduction && isSimulationExplicit) {
    throw new Error('[Startup Error] SIMULATION_MODE is strictly prohibited in production environment.');
  }

  if (isProduction) {
    const missing = [];
    if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
    if (!process.env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');

    if (missing.length > 0) {
      throw new Error(`[Startup Error] Missing critical production configuration: ${missing.join(', ')}`);
    }
  }
};

module.exports = { validateEnv };
