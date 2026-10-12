'use strict';

const fs = require('fs');
const path = require('path');
const { tenantDbManager } = require('../infrastructure/database/tenant-database-manager');
const logger = require('../observability/logger');

async function seedIntelligence() {
  await tenantDbManager.connect();
  const intelDb = tenantDbManager.getIntelligenceDb();
  const dbDir = path.resolve(__dirname, '../../../DB');

  logger.info('Starting vulnerability intelligence database seeding...', { dbDir });

  // 1. Seed components_database
  const compFile = path.join(dbDir, 'vulnerability_data.components_database.json');
  if (fs.existsSync(compFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(compFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const id = item._id || item.id || item.name;
          await intelDb.collection('components_database').updateOne(
            { _id: id },
            { $set: item },
            { upsert: true }
          );
        }
        logger.info(`Seeded ${data.length} records into components_database`);
      }
    } catch (e) {
      logger.error('Failed to seed components_database', { error: e.message });
    }
  }

  // 2. Seed package_catalog
  const pkgFile = path.join(dbDir, 'vulnerability_data.package_catalog.json');
  if (fs.existsSync(pkgFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const id = item._id || item.id || `${item.ecosystem}:${item.package_name}`;
          await intelDb.collection('package_catalog').updateOne(
            { _id: id },
            { $set: item },
            { upsert: true }
          );
        }
        logger.info(`Seeded ${data.length} records into package_catalog`);
      }
    } catch (e) {
      logger.error('Failed to seed package_catalog', { error: e.message });
    }
  }

  // 3. Seed cve_database
  const cveFiles = [
    path.join(dbDir, 'vulnerability_data.cve_database.json'),
    path.join(dbDir, 'vigilant_i.cve_database.json')
  ];

  for (const cveFile of cveFiles) {
    if (fs.existsSync(cveFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(cveFile, 'utf8'));
        if (Array.isArray(data) && data.length > 0) {
          for (const item of data) {
            const id = item._id || item.id || item.cve_id;
            await intelDb.collection('cve_database').updateOne(
              { _id: id },
              { $set: item },
              { upsert: true }
            );
          }
          logger.info(`Seeded ${data.length} records from ${path.basename(cveFile)} into cve_database`);
        }
      } catch (e) {
        logger.error(`Failed to seed from ${path.basename(cveFile)}`, { error: e.message });
      }
    }
  }

  logger.info('Intelligence seeding completed successfully');
}

if (require.main === module) {
  seedIntelligence()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed intelligence error:', err);
      process.exit(1);
    });
}

module.exports = seedIntelligence;
