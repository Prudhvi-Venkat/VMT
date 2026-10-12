'use strict';

class ExportSbomUseCase {
  constructor({ sbomExportService }) {
    this.sbomExportService = sbomExportService;
  }

  async execute({ tenantId, scanId, format, standard }) {
    return this.sbomExportService.exportSbom({
      tenantId,
      scanId,
      format,
      standard
    });
  }
}

module.exports = ExportSbomUseCase;
