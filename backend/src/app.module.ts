import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CustomersModule } from './customers/customers.module';
import { UnitsModule } from './units/units.module';
import { PaymentModesModule } from './payment-modes/payment-modes.module';
import { PaymentTypesModule } from './payment-types/payment-types.module';
import { ExpenseCategoriesModule } from './expense-categories/expense-categories.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { SupplierPaymentsModule } from './supplier-payments/supplier-payments.module';
import { CustomerReceiptsModule } from './customer-receipts/customer-receipts.module';
import { SettingsModule } from './settings/settings.module';
import { PurchaseReturnsModule } from './purchase-returns/purchase-returns.module';
import { SalesReturnsModule } from './sales-returns/sales-returns.module';
import { ExpensesModule } from './expenses/expenses.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { ReportsModule } from './reports/reports.module';
import { RolesModule } from './roles/roles.module';
import { BankDepositsModule } from './bank-deposits/bank-deposits.module';
import { ChequeEntriesModule } from './cheque-entries/cheque-entries.module';
import { EmployeesModule } from './employees/employees.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads/',
    }),
    ProductsModule, 
    CategoriesModule, 
    BrandsModule, 
    SuppliersModule, 
    CustomersModule, 
    UnitsModule, 
    PaymentModesModule, 
    PaymentTypesModule,
    ExpenseCategoriesModule, 
    PrismaModule, 
    UsersModule, 
    AuthModule, 
    DashboardModule, 
    PurchasesModule, 
    SalesModule, 
    SupplierPaymentsModule, 
    CustomerReceiptsModule, 
    SettingsModule,
    PurchaseReturnsModule,
    SalesReturnsModule,
    ExpensesModule,
    WhatsappModule,
    ReportsModule,
    RolesModule,
    BankDepositsModule,
    ChequeEntriesModule,
    EmployeesModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
