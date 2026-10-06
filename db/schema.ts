import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const requests = sqliteTable('requests', {
 id:text('id').primaryKey(), tenant:text('tenant').notNull(), requestKey:text('request_key').notNull(),
 ownerName:text('owner_name').notNull(), phone:text('phone').notNull(), email:text('email').notNull().default(''),
 dogName:text('dog_name').notNull(), breed:text('breed').notNull(), size:text('size').notNull(), service:text('service').notNull(),
 address:text('address').notNull(), preferredDate:text('preferred_date').notNull(), timeWindow:text('time_window').notNull(),
 notes:text('notes').notNull().default(''), status:text('status').notNull().default('new'), scheduledAt:text('scheduled_at'),
 seen:integer('seen').notNull().default(0), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(),
},t=>[index('idx_requests_tenant_created').on(t.tenant,t.createdAt), uniqueIndex('idx_requests_idempotency').on(t.tenant,t.requestKey)]);
export const rateLimits=sqliteTable('rate_limits',{key:text('key').primaryKey(), count:integer('count').notNull(), expiresAt:integer('expires_at').notNull()});
