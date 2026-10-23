import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://postgres:root@localhost:5432/pos-suite360?schema=public" });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding default role and user...');

  const role = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      permissions: ['ALL'],
    },
  });

  const hashedPassword = await bcrypt.hash('password', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: 'Pro X Admin',
      roleId: role.id,
    },
  });

  const expenseCategories = [
    'Electricity Bill',
    'Shop Rent',
    'Tea & Refreshments',
    'Internet / Phone',
    'Maintenance & Repairs',
    'Miscellaneous'
  ];

  for (const name of expenseCategories) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const paymentModes = ['Cash', 'Bank Transfer', 'UPI'];
  const paymentModeMap = new Map<string, number>();
  for (const name of paymentModes) {
    const mode = await prisma.paymentMode.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    paymentModeMap.set(name, mode.id);
  }

  const categories = ['Beverages', 'Snacks', 'Dairy', 'Bakery', 'Household'];
  const categoryMap = new Map<string, number>();
  for (const name of categories) {
    const category = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryMap.set(name, category.id);
  }

  const brands = ['Coca-Cola', 'Nestle', 'Milo', 'Local Brand', 'Gardenia'];
  const brandMap = new Map<string, number>();
  for (const name of brands) {
    const brand = await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    brandMap.set(name, brand.id);
  }

  const units = [
    { name: 'Nos', shortCode: 'PCS' },
    { name: 'Bottle', shortCode: 'BTL' },
    { name: 'Pack', shortCode: 'PK' },
    { name: 'Box', shortCode: 'BOX' },
  ];
  const unitMap = new Map<string, number>();
  for (const unit of units) {
    const existing = await prisma.unit.upsert({
      where: { name: unit.name },
      update: { shortCode: unit.shortCode },
      create: { name: unit.name, shortCode: unit.shortCode },
    });
    unitMap.set(unit.name, existing.id);
  }

  const suppliers = [
    { name: 'Prime Foods Supply', phone: '0123456789', email: 'prime@foods.com', address: 'Kuala Lumpur' },
    { name: 'Fresh Mart Distributors', phone: '0134567890', email: 'freshmart@dist.com', address: 'Petaling Jaya' },
  ];
  const supplierMap = new Map<string, number>();
  for (const supplier of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { name: supplier.name },
    });

    const record = existing ?? await prisma.supplier.create({
      data: {
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
      },
    });

    supplierMap.set(supplier.name, record.id);
  }

  const customers = [
    { name: 'Walk-in Customer', phone: '0000000000', address: 'Store Walk-in' },
    { name: 'Jaya Mart', phone: '0112233445', address: 'Shah Alam' },
    { name: 'Maju Minimart', phone: '0198765432', address: 'Klang' },
  ];
  const customerMap = new Map<string, number>();
  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: { phone: customer.phone },
    });

    const record = existing ?? await prisma.customer.create({
      data: {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      },
    });

    customerMap.set(customer.name, record.id);
  }

  const productCatalog = [
    {
      name: 'Coca-Cola 250ml',
      code: 'CC-250',
      category: 'Beverages',
      brand: 'Coca-Cola',
      unit: 'Bottle',
      supplier: 'Prime Foods Supply',
      purchaseRate: 2.4,
      sellingRate: 4.5,
      wholesaleRate: 4.0,
      mrp: 4.8,
      currentStock: 80,
    },
    {
      name: 'Nestle Milo 1kg',
      code: 'MILO-1KG',
      category: 'Beverages',
      brand: 'Nestle',
      unit: 'Pack',
      supplier: 'Prime Foods Supply',
      purchaseRate: 12.0,
      sellingRate: 16.5,
      wholesaleRate: 15.0,
      mrp: 17.5,
      currentStock: 30,
    },
    {
      name: 'Potato Chips Classic',
      code: 'CHIPS-CLS',
      category: 'Snacks',
      brand: 'Local Brand',
      unit: 'Pack',
      supplier: 'Fresh Mart Distributors',
      purchaseRate: 2.8,
      sellingRate: 5.0,
      wholesaleRate: 4.5,
      mrp: 5.5,
      currentStock: 60,
    },
    {
      name: 'Fresh Milk 1L',
      code: 'MILK-1L',
      category: 'Dairy',
      brand: 'Nestle',
      unit: 'Bottle',
      supplier: 'Fresh Mart Distributors',
      purchaseRate: 4.2,
      sellingRate: 6.8,
      wholesaleRate: 6.2,
      mrp: 7.2,
      currentStock: 50,
    },
    {
      name: 'Gardenia Bread',
      code: 'BREAD-GD',
      category: 'Bakery',
      brand: 'Gardenia',
      unit: 'Nos',
      supplier: 'Fresh Mart Distributors',
      purchaseRate: 2.4,
      sellingRate: 3.8,
      wholesaleRate: 3.3,
      mrp: 4.2,
      currentStock: 40,
    },
  ];

  const productMap = new Map<string, number>();
  for (const product of productCatalog) {
    const record = await prisma.product.upsert({
      where: { code: product.code },
      update: {
        name: product.name,
        categoryId: categoryMap.get(product.category) ?? null,
        brandId: brandMap.get(product.brand) ?? null,
        unitId: unitMap.get(product.unit) ?? unitMap.get('Nos')!,
        supplierId: supplierMap.get(product.supplier) ?? null,
        purchaseRate: product.purchaseRate,
        sellingRate: product.sellingRate,
        wholesaleRate: product.wholesaleRate,
        mrp: product.mrp,
        currentStock: product.currentStock,
      },
      create: {
        name: product.name,
        code: product.code,
        categoryId: categoryMap.get(product.category) ?? null,
        brandId: brandMap.get(product.brand) ?? null,
        unitId: unitMap.get(product.unit) ?? unitMap.get('Nos')!,
        supplierId: supplierMap.get(product.supplier) ?? null,
        purchaseRate: product.purchaseRate,
        sellingRate: product.sellingRate,
        wholesaleRate: product.wholesaleRate,
        mrp: product.mrp,
        currentStock: product.currentStock,
      },
    });

    productMap.set(product.code, record.id);
  }

  const salesSeedData = [
    {
      invoiceNo: 'INV-2026-001',
      customer: 'Jaya Mart',
      paymentMode: 'Cash',
      date: new Date('2026-10-01T09:00:00+08:00'),
      items: [
        { productCode: 'CC-250', quantity: 8, rate: 4.5 },
        { productCode: 'CHIPS-CLS', quantity: 6, rate: 5.0 },
      ],
    },
    {
      invoiceNo: 'INV-2026-002',
      customer: 'Maju Minimart',
      paymentMode: 'Bank Transfer',
      date: new Date('2026-10-05T11:30:00+08:00'),
      items: [
        { productCode: 'MILK-1L', quantity: 10, rate: 6.8 },
        { productCode: 'BREAD-GD', quantity: 12, rate: 3.8 },
      ],
    },
    {
      invoiceNo: 'INV-2026-003',
      customer: 'Walk-in Customer',
      paymentMode: 'UPI',
      date: new Date('2026-10-10T15:15:00+08:00'),
      items: [
        { productCode: 'MILO-1KG', quantity: 3, rate: 16.5 },
        { productCode: 'CC-250', quantity: 4, rate: 4.5 },
      ],
    },
    {
      invoiceNo: 'INV-2026-004',
      customer: 'Jaya Mart',
      paymentMode: 'Cash',
      date: new Date('2026-10-18T13:45:00+08:00'),
      items: [
        { productCode: 'MILO-1KG', quantity: 4, rate: 16.5 },
        { productCode: 'MILK-1L', quantity: 8, rate: 6.8 },
      ],
    },
    {
      invoiceNo: 'INV-2026-005',
      customer: 'Maju Minimart',
      paymentMode: 'UPI',
      date: new Date('2026-10-23T10:10:00+08:00'),
      items: [
        { productCode: 'CHIPS-CLS', quantity: 10, rate: 5.0 },
        { productCode: 'BREAD-GD', quantity: 15, rate: 3.8 },
      ],
    },
    {
      invoiceNo: 'INV-00624',
      customer: 'Jaya Mart',
      paymentMode: 'Cash',
      date: new Date('2026-10-23T09:00:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 3.4, rate: 6.9 },
      ],
    },
    {
      invoiceNo: 'INV-00638',
      customer: 'Maju Minimart',
      paymentMode: 'Bank Transfer',
      date: new Date('2026-10-23T10:05:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 51, rate: 6.9 },
      ],
    },
    {
      invoiceNo: 'INV-00621',
      customer: 'Walk-in Customer',
      paymentMode: 'Cash',
      date: new Date('2026-10-23T11:10:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 28.6, rate: 7.1 },
      ],
    },
    {
      invoiceNo: 'INV-00628',
      customer: 'Jaya Mart',
      paymentMode: 'UPI',
      date: new Date('2026-10-23T12:15:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 9.1, rate: 7.8 },
      ],
    },
    {
      invoiceNo: 'INV-00622',
      customer: 'Maju Minimart',
      paymentMode: 'Cash',
      date: new Date('2026-10-23T13:20:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 3.8, rate: 6.8 },
      ],
    },
    {
      invoiceNo: 'INV-00629',
      customer: 'Walk-in Customer',
      paymentMode: 'Bank Transfer',
      date: new Date('2026-10-23T14:25:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 6.8, rate: 7.8 },
      ],
    },
    {
      invoiceNo: 'INV-00630',
      customer: 'Jaya Mart',
      paymentMode: 'UPI',
      date: new Date('2026-10-23T15:30:00+08:00'),
      items: [
        { productCode: 'BREAD-GD', quantity: 13.6, rate: 7.8 },
      ],
    },
  ];

  for (const saleSeed of salesSeedData) {
    const round2 = (value: number) => Number(Number(value).toFixed(2));
    const subtotal = saleSeed.items.reduce((sum, item) => {
      const lineTotal = round2(Number(item.quantity) * Number(item.rate));
      return round2(sum + lineTotal);
    }, 0);

    const sale = await prisma.sale.create({
      data: {
        invoiceNo: saleSeed.invoiceNo,
        date: saleSeed.date,
        customerId: customerMap.get(saleSeed.customer) ?? customerMap.get('Walk-in Customer')!,
        userId: admin.id,
        paymentModeId: paymentModeMap.get(saleSeed.paymentMode) ?? paymentModeMap.get('Cash')!,
        subtotal: round2(subtotal),
        tax: 0,
        discount: 0,
        grandTotal: round2(subtotal),
        items: {
          create: saleSeed.items.map((item) => ({
            productId: productMap.get(item.productCode)!,
            quantity: Number(Number(item.quantity).toFixed(2)),
            noOfBirds: 0,
            rate: Number(Number(item.rate).toFixed(2)),
            discount: 0,
            tax: 0,
            amount: round2(Number(item.quantity) * Number(item.rate)),
          })),
        },
      },
    });

    console.log(`Created sale ${sale.invoiceNo} for ${saleSeed.customer}`);
  }

  console.log('Seeding complete!', admin.username);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
