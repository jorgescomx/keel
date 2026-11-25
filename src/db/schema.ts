import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("Layers"),
  color: text("color").notNull().default("#3b82f6"),
  itemCounter: integer("item_counter").notNull().default(0),
  settings: text("settings").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const itemTypes = sqliteTable("item_types", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pluralName: text("plural_name").notNull(),
  icon: text("icon").notNull().default("CheckSquare"),
  color: text("color").notNull().default("#3b82f6"),
  level: integer("level").notNull().default(2),
  position: integer("position").notNull().default(0),
});

export const statuses = sqliteTable("statuses", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull().default("todo"),
  color: text("color").notNull().default("#64748b"),
  position: integer("position").notNull().default(0),
  wipLimit: integer("wip_limit"),
});

export const customFields = sqliteTable("custom_fields", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull().default("text"),
  options: text("options").notNull().default("[]"),
  applicableTypeIds: text("applicable_type_ids").notNull().default("[]"),
  showOnCard: integer("show_on_card", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const items = sqliteTable("items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  typeId: text("type_id")
    .notNull()
    .references(() => itemTypes.id),
  statusId: text("status_id")
    .notNull()
    .references(() => statuses.id),
  priority: text("priority").notNull().default("medium"),
  parentId: text("parent_id"),
  labels: text("labels").notNull().default("[]"),
  dueDate: text("due_date"),
  customFields: text("custom_fields").notNull().default("{}"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  author: text("author").notNull().default("You"),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const views = sqliteTable("views", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  layout: text("layout").notNull().default("board"),
  query: text("query").notNull().default(""),
  filters: text("filters").notNull().default("{}"),
  hiddenStatusIds: text("hidden_status_ids").notNull().default("[]"),
  swimlaneBy: text("swimlane_by").notNull().default("none"),
  compact: integer("compact", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isMasterAdmin: integer("is_master_admin", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(), // base64url credential ID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // base64 encoded COSE public key
  counter: integer("counter").notNull().default(0),
  transports: text("transports").notNull().default("[]"),
  deviceName: text("device_name").notNull().default("Passkey"),
  createdAt: text("created_at").notNull(),
});

export const webauthnChallenges = sqliteTable("webauthn_challenges", {
  id: text("id").primaryKey(),
  challenge: text("challenge").notNull(),
  userId: text("user_id"),
  purpose: text("purpose").notNull(), // "register" | "login"
  expiresAt: text("expires_at").notNull(),
});

export const projectMembers = sqliteTable("project_members", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // "owner" | "admin" | "member" | "viewer"
  createdAt: text("created_at").notNull(),
});

export const projectInvitations = sqliteTable("project_invitations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  token: text("token").notNull().unique(),
  invitedByUserId: text("invited_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull(),
});
