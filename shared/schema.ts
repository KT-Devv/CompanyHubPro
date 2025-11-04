import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["owner", "hr", "project_manager", "supervisor", "secretary"]);
export const workerTypeEnum = pgEnum("worker_type", ["office", "grounds"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["Present", "Absent", "Leave"]);
export const goodsLogTypeEnum = pgEnum("goods_log_type", ["sent", "received"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["purchase", "sale"]);

// Users table (profile data for Supabase Auth users)
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // References auth.users(id)
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  siteId: varchar("site_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sites table
export const sites = pgTable("sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  siteName: text("site_name").notNull(),
  isMain: integer("is_main").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Portfolio table (for grounds workers)
export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioName: text("portfolio_name").notNull(),
  ratio: integer("ratio").notNull(),
  rate: integer("rate").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Position table (for office workers)
export const positions = pgTable("positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  positionName: text("position_name").notNull(),
  rate: integer("rate").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Workers table
export const workers = pgTable("workers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  dob: date("dob").notNull(),
  workerType: workerTypeEnum("worker_type").notNull(),
  siteId: varchar("site_id").references(() => sites.id),
  portfolioId: varchar("portfolio_id").references(() => portfolios.id),
  positionId: varchar("position_id").references(() => positions.id),
  dateOfEmployment: date("date_of_employment").notNull(),
  phoneNumber: text("phone_number").notNull(),
  nationalId: text("national_id").notNull(),
  contactPerson: text("contact_person").notNull(),
  cpPhone: text("cp_phone").notNull(),
  cpRelation: text("cp_relation").notNull(),
  rate: integer("rate").notNull().default(0),
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
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").references(() => stores.id).notNull(),
  itemId: varchar("item_id").references(() => inventory.id).notNull(),
  amount: integer("amount").notNull(),
  supplierName: text("supplier_name").notNull(),
  type: invoiceTypeEnum("type").notNull(),
  date: timestamp("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Attendance table
export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workerId: varchar("worker_id").references(() => workers.id).notNull(),
  siteId: varchar("site_id").references(() => sites.id),
  date: date("date").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: attendanceStatusEnum("status").notNull(),
  markedBy: varchar("marked_by").references(() => users.id).notNull(),
  workerType: workerTypeEnum("worker_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

// Login Schema
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export type LoginData = z.infer<typeof loginSchema>;
