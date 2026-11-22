/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as auth_password from "../auth/password.js";
import type * as branding from "../branding.js";
import type * as businesses from "../businesses.js";
import type * as cart from "../cart.js";
import type * as catalog from "../catalog.js";
import type * as coupons from "../coupons.js";
import type * as couriers from "../couriers.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as maps from "../maps.js";
import type * as marketing from "../marketing.js";
import type * as marketingState from "../marketingState.js";
import type * as notifications from "../notifications.js";
import type * as orders from "../orders.js";
import type * as paymentWebhook from "../paymentWebhook.js";
import type * as profiles from "../profiles.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";
import type * as reviews from "../reviews.js";
import type * as seed from "../seed.js";
import type * as seedVerticals from "../seedVerticals.js";
import type * as stories from "../stories.js";
import type * as subscriptions from "../subscriptions.js";
import type * as support from "../support.js";
import type * as trust from "../trust.js";
import type * as users from "../users.js";
import type * as verification from "../verification.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  "auth/password": typeof auth_password;
  branding: typeof branding;
  businesses: typeof businesses;
  cart: typeof cart;
  catalog: typeof catalog;
  coupons: typeof coupons;
  couriers: typeof couriers;
  crons: typeof crons;
  http: typeof http;
  maps: typeof maps;
  marketing: typeof marketing;
  marketingState: typeof marketingState;
  notifications: typeof notifications;
  orders: typeof orders;
  paymentWebhook: typeof paymentWebhook;
  profiles: typeof profiles;
  push: typeof push;
  pushNode: typeof pushNode;
  reviews: typeof reviews;
  seed: typeof seed;
  seedVerticals: typeof seedVerticals;
  stories: typeof stories;
  subscriptions: typeof subscriptions;
  support: typeof support;
  trust: typeof trust;
  users: typeof users;
  verification: typeof verification;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
