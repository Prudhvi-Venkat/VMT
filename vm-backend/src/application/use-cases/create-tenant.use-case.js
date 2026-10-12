'use strict';

class CreateTenantUseCase {
  constructor({ tenantManagementService }) {
    this.tenantManagementService = tenantManagementService;
  }

  async execute(tenantData) {
    return this.tenantManagementService.createTenant(tenantData);
  }
}

module.exports = CreateTenantUseCase;
