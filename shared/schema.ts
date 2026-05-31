import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, date, pgEnum, unique, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["ceo", "hr", "finance", "system_manager", "project_manager", "supervisor", "logistics_manager", "store_manager", "secretary"]);
<<<<<<< HEAD
export const workerTypeEnum = pgEnum("worker_type", ["casual", "non_marking"]);
=======
export const workerTypeEnum = pgEnum("worker_type", ["casual", "non-marking"]);
>>>>>>> 73b9094af9e2160a5992f480ddc32790a0463cb0
export const attendanceStatusEnum = pgEnum("attendance_status", ["Present", "Absent", "Leave", "Half Day"]);
export const goodsLogTypeEnum = pgEnum("goods_log_type", ["sent", "received"]);
export const goodsLogStatusEnum = pgEnum("goods_log_status", ["pending", "matched", "error"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["purchase", "sale"]);

// Users table (profile data for Supabase Auth users)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // References auth.users(id)
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  siteId: varchar("site_id"),
  storeId: varchar("store_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sector table
export const sectors = pgTable("Sector", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectorName: text("sector_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sites table
export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteName: text("site_name").notNull(),
  sectorId: varchar("sector_id").references(() => sectors.id),
  sector: varchar("sector").references(() => sectors.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Portfolio table (for grounds workers)
export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioName: text("portfolio_name").notNull(),
  rate: integer("rate").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Position table (for office workers)
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  positionName: text("position_name").notNull(),
  rate: integer("rate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Workers table
// siteId: The assigned site for the worker
// This is the primary site where the worker is allocated
export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  dob: date("dob"),
  workerType: workerTypeEnum("worker_type"),
  portfolioId: varchar("portfolio_id").references(() => portfolios.id),
  positionId: varchar("position_id").references(() => positions.id),
  siteId: varchar("site_id").references(() => sites.id),
  dateOfEmployment: date("date_of_employment"),
  phoneNumber: text("phone_number"),
  nationalId: text("national_id"),
  contactPerson: text("contact_person"),
  cpPhone: text("cp_phone"),
  cpRelation: text("cp_relation"),
  hometown: text("hometown"),
  currentLocation: text("current_location"),
  accountLocation: varchar("account_location").references(() => sites.id),
  accountNumber: text("account_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stores table
export const stores = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Inventory table
export const inventory = pgTable("inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").references(() => stores.id).notNull(),
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").notNull().default(0),
  remarks: text("remarks"),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

// Goods Log table
export const goodsLog = pgTable("goods_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").references(() => inventory.id).notNull(),
  storeFrom: varchar("store_from").references(() => stores.id),
  storeTo: varchar("store_to").references(() => stores.id),
  quantity: integer("quantity").notNull(),
  type: goodsLogTypeEnum("type").notNull(),
  status: goodsLogStatusEnum("status").default("pending").notNull(),
  referenceId: varchar("reference_id"),
  remarks: text("remarks"),
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").references(() => stores.id).notNull(),
  itemId: varchar("item_id").references(() => inventory.id).notNull(),
  amount: integer("amount").notNull(),
  quantity: integer("quantity").notNull().default(1),
  supplierName: text("supplier_name").notNull(),
  type: invoiceTypeEnum("type").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Attendance table
// Marks attendance for a worker on a specific date
// Once marked, cannot be marked again (prevents duplicate entries)
export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  date: date("date").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: attendanceStatusEnum("status").notNull(),
  markedBy: varchar("marked_by").references(() => users.id).notNull(),
  workerType: workerTypeEnum("worker_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueWorkerDate: unique().on(table.workerId, table.date),
}));

// Salary Advances table
export const salaryAdvances = pgTable("salary_advances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  amount: integer("amount").notNull(),
  month: varchar("month").notNull(), // Format: YYYY-MM
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Loans table
export const loans = pgTable("loans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  amount: integer("amount").notNull(),
  month: varchar("month").notNull(), // Format: YYYY-MM
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Worker Transfers table
export const workerTransfers = pgTable("worker_transfers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  fromSiteId: varchar("from_site_id").references(() => sites.id),
<<<<<<< HEAD
  toSiteId: varchar("to_site_id").references(() => sites.id),
  effectiveDate: date("effective_date").notNull(),
  clearedAccount: boolean("cleared_account").default(false),
  oldAccountNumber: varchar("old_account_number"),
  newAccountNumber: varchar("new_account_number"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
=======
  toSiteId: varchar("to_site_id").references(() => sites.id).notNull(),
  transferDate: date("transfer_date").notNull(),
  notes: text("notes"),
>>>>>>> 73b9094af9e2160a5992f480ddc32790a0463cb0
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWorkerTransferSchema = createInsertSchema(workerTransfers).omit({
  id: true,
  createdAt: true,
});

export type InsertWorkerTransfer = z.infer<typeof insertWorkerTransferSchema>;
export type WorkerTransfer = typeof workerTransfers.$inferSelect;

// Deductions table
export const deductions = pgTable("deductions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  amount: integer("amount").notNull(),
  month: varchar("month").notNull(), // Format: YYYY-MM
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Salary Schedules table
export const salarySchedules = pgTable("salary_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  siteId: varchar("site_id").references(() => sites.id),
  portfolioId: varchar("portfolio_id"),
  positionId: varchar("position_id"),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  daysPresent: integer("days_present").default(0),
  rate: integer("rate").default(0),
  accountLocation: varchar("account_location"),
  accountNumber: varchar("account_number"),
  grossAmount: integer("gross_amount").default(0),
  deductions: jsonb("deductions").default('{}'),
  netAmount: integer("net_amount").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertSiteSchema = createInsertSchema(sites).omit({
  id: true,
  createdAt: true,
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  createdAt: true,
});

export const insertPositionSchema = createInsertSchema(positions).omit({
  id: true,
  createdAt: true,
});

export const insertWorkerSchema = createInsertSchema(workers).omit({
  id: true,
  createdAt: true,
});

export const insertStoreSchema = createInsertSchema(stores).omit({
  id: true,
  createdAt: true,
});

export const insertInventorySchema = createInsertSchema(inventory).omit({
  id: true,
  lastUpdated: true,
});

export const insertGoodsLogSchema = createInsertSchema(goodsLog).omit({
  id: true,
  createdAt: true,
  date: true,
  status: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  createdAt: true,
  date: true,
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true,
  createdAt: true,
  timestamp: true,
});

export const insertSalaryAdvanceSchema = createInsertSchema(salaryAdvances).omit({
  id: true,
  createdAt: true,
});

export const insertLoanSchema = createInsertSchema(loans).omit({
  id: true,
  createdAt: true,
});

export const insertDeductionSchema = createInsertSchema(deductions).omit({
  id: true,
  createdAt: true,
});

export const insertSalaryScheduleSchema = createInsertSchema(salarySchedules).omit({
  id: true,
  createdAt: true,
});

export const insertSectorSchema = createInsertSchema(sectors).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type Position = typeof positions.$inferSelect;

export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workers.$inferSelect;

export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof stores.$inferSelect;

export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventory.$inferSelect;

export type InsertGoodsLog = z.infer<typeof insertGoodsLogSchema>;
export type GoodsLog = typeof goodsLog.$inferSelect;

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export type InsertSalaryAdvance = z.infer<typeof insertSalaryAdvanceSchema>;
export type SalaryAdvance = typeof salaryAdvances.$inferSelect;

export type InsertLoan = z.infer<typeof insertLoanSchema>;
export type Loan = typeof loans.$inferSelect;

export type InsertDeduction = z.infer<typeof insertDeductionSchema>;
export type Deduction = typeof deductions.$inferSelect;

export type InsertSalarySchedule = z.infer<typeof insertSalaryScheduleSchema>;
export type SalarySchedule = typeof salarySchedules.$inferSelect;

export type InsertSector = z.infer<typeof insertSectorSchema>;
export type Sector = typeof sectors.$inferSelect;

// Login Schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginData = z.infer<typeof loginSchema>;
