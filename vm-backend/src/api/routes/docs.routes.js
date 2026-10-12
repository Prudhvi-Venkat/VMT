'use strict';

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

function createDocsRoutes() {
  const router = express.Router();

  const openapiPath = path.join(__dirname, '../../../docs/api/openapi.json');
  let openapiDoc = {};
  try {
    if (fs.existsSync(openapiPath)) {
      openapiDoc = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
    }
  } catch (err) {
    // Fallback minimal doc
    openapiDoc = { openapi: '3.0.0', info: { title: 'VM Backend API', version: '1.0.0' } };
  }

  // Serve raw openapi JSON
  router.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openapiDoc);
  });

  // Serve Swagger UI
  router.use('/', swaggerUi.serve, swaggerUi.setup(openapiDoc, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Enterprise Vulnerability Management API Docs'
  }));

  return router;
}

module.exports = createDocsRoutes;
