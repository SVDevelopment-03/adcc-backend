import { Response } from 'express';
import mongoose from 'mongoose';
import MerchandiseProduct from '@/models/merchandise-product.model';
import MerchandiseCategory from '@/models/merchandise-category.model';
import MerchandiseOrder from '@/models/merchandise-order.model';
import User from '@/models/user.model';
import { sendSuccess } from '@/utils/response';
import { asyncHandler } from '@/utils/async-handler';
import { AppError } from '@/utils/app-error';
import { AuthRequest } from '@/middleware/auth.middleware';
import { t } from '@/utils/i18n';
import {
  localizeMerchandiseProductStatic,
  localizeMerchandiseCategoryStatic,
} from '@/utils/localization';
import { translateFieldsToArabic } from '@/services/translation.service';

const ensureObjectId = (id: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError('Invalid ID', 400);
  }
  return new mongoose.Types.ObjectId(id);
};

const buildSlugId = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `category-${Date.now()}`;

const isAdminUser = (req: AuthRequest): boolean => req.user?.role === 'Admin';
const isVendorUser = (req: AuthRequest): boolean => req.user?.role === 'Vendor';

const buildProductQuery = (query: any, isAdmin: boolean) => {
  const filter: any = {};

  if (query.source) {
    filter.source = String(query.source);
  }
  if (query.status) {
    const statusValue = String(query.status).trim().toLowerCase();
    if (statusValue === 'approved') {
      filter.status = 'published';
    } else {
      filter.status = String(query.status);
    }
  } else if (!isAdmin) {
    filter.status = 'published';
  }

  if (query.categoryId) {
    filter.categoryId = String(query.categoryId);
  }
  if (query.subcategoryId) {
    filter.subcategoryId = String(query.subcategoryId);
  }

  if (query.q) {
    const regex = new RegExp(String(query.q), 'i');
    filter.$or = [
      { name: regex },
      { sku: regex },
      { description: regex },
    ];
  }

  return filter;
};

const buildOrderQuery = (query: any) => {
  const filter: any = {};
  if (query.status) {
    filter.status = String(query.status);
  }

  if (query.userId) {
    filter.userId = ensureObjectId(String(query.userId));
  }

  if (query.q) {
    const regex = new RegExp(String(query.q), 'i');
    filter.$or = [
      { orderNumber: regex },
      { userName: regex },
    ];
  }

  return filter;
};

const canModifyProduct = (req: AuthRequest, product: any): boolean => {
  if (isAdminUser(req)) return true;
  if (!isVendorUser(req)) return false;

  const userId = req.user?.id;
  if (!userId) return false;
  return product.createdBy?.toString() === String(userId);
};

const calculateTotalStock = (variants: Array<{ stock?: number }>) =>
  variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);

const adjustStockForOrderItems = async (items: any[], restore: boolean) => {
  const changeAmount = restore ? 1 : -1;

  for (const item of items) {
    const productId = String(item.productId || '');
    const quantity = Number(item.quantity || 0);
    if (!productId || quantity <= 0) continue;

    const product = await MerchandiseProduct.findById(ensureObjectId(productId));
    if (!product) {
      throw new AppError(`Product not found: ${productId}`, 404);
    }

    const normalizedSize = String(item.size ?? '').trim().toLowerCase();
    const normalizedColor = String(item.color ?? '').trim().toLowerCase();
    let adjusted = false;

    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const variant = product.variants.find((variant) => {
        const variantSize = String(variant.size ?? '').trim().toLowerCase();
        const variantColor = String(variant.color ?? '').trim().toLowerCase();
        return variantSize === normalizedSize && variantColor === normalizedColor;
      });

      if (!variant) {
        throw new AppError(
          `Variant not found for product ${product.name} (${normalizedSize} / ${normalizedColor})`,
          400,
        );
      }

      const newVariantStock = Number(variant.stock || 0) + changeAmount * quantity;
      if (newVariantStock < 0) {
        throw new AppError(
          `Insufficient variant stock for ${product.name} (${normalizedSize} / ${normalizedColor})`,
          400,
        );
      }
      variant.stock = newVariantStock;
      product.totalStock = Math.max(0, Number(product.totalStock || 0) + changeAmount * quantity);
      product.markModified('variants');
      adjusted = true;
    }

    if (!adjusted) {
      const newTotalStock = Number(product.totalStock || 0) + changeAmount * quantity;
      if (newTotalStock < 0) {
        throw new AppError(`Insufficient stock for product ${product.name}`, 400);
      }
      product.totalStock = newTotalStock;
    }

    const soldChange = restore ? -quantity : quantity;
    product.sold = Math.max(0, Number(product.sold || 0) + soldChange);

    await product.save();
  }
};

const getOrderStatusStage = (status: string): number => {
  const normalized = String(status).trim().toLowerCase();
  switch (normalized) {
    case 'confirmed':
      return 1;
    case 'processing':
      return 2;
    case 'shipped':
      return 3;
    case 'delivered':
      return 4;
    default:
      return 0;
  }
};

const generateOrderNumber = (): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `MERCH-${timestamp}-${randomSuffix}`;
};

export const getMerchandiseProducts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { page = 1, limit = 20 } = req.query as any;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const isAdmin = isAdminUser(req);
  const filter = buildProductQuery(req.query, isAdmin);

  if (req.query.category) {
    const categoryName = String(req.query.category).trim();
    if (categoryName.length > 0) {
      const matchedCategories = await MerchandiseCategory.find({ name: categoryName }).select('id').lean();
      if (matchedCategories.length > 0) {
        filter.categoryId = { $in: matchedCategories.map(c => c.id) };
      } else {
        filter.categoryId = '__no_match__';
      }
    }
  }

  const [products, total] = await Promise.all([
    MerchandiseProduct.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    MerchandiseProduct.countDocuments(filter),
  ]);

  const categoryIds = [...new Set(products.map((p: any) => p.categoryId).filter(Boolean))];
  const categories = categoryIds.length
    ? await MerchandiseCategory.find({ id: { $in: categoryIds } }).lean()
    : [];
  categories.forEach((cat: any) => localizeMerchandiseCategoryStatic(cat, lang as any));
  const categoryMap = new Map(categories.map((cat: any) => [cat.id, cat.name]));

  const productsWithCategory = products.map((product: any) => {
    localizeMerchandiseProductStatic(product, lang as any);
    return {
      ...product,
      categoryName: categoryMap.get(product.categoryId) ?? product.categoryId,
    };
  });

  sendSuccess(res, {
    items: productsWithCategory,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  }, t(lang, 'merchandise.products_list') || 'Merchandise products retrieved');
});

export const getMerchandiseProductById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const product: any = await MerchandiseProduct.findById(ensureObjectId(String(id))).lean();

  if (!product || (product.status !== 'published' && !isAdminUser(req))) {
    throw new AppError('Product not found', 404);
  }

  if (product.categoryId) {
    const category: any = await MerchandiseCategory.findOne({ id: product.categoryId }).lean();
    if (category) {
      localizeMerchandiseCategoryStatic(category, lang as any);
      product.categoryName = category.name;
    }
  }

  localizeMerchandiseProductStatic(product, lang as any);

  // If the request is for Arabic and the product lacks `specificationsAr`,
  // attempt a best-effort on-the-fly translation for the response so the
  // client immediately sees Arabic specs even before a DB backfill runs.
  if (lang === 'ar') {
    try {
      const hasSpecsAr = Array.isArray(product.specificationsAr) && product.specificationsAr.length > 0;
      if (!hasSpecsAr && Array.isArray(product.specifications) && product.specifications.length > 0) {
        const fieldsToTranslate: Record<string, string | null | undefined> = {};
        (product.specifications as Array<any>).forEach((s: any, idx: number) => {
          fieldsToTranslate[`spec_${idx}_label`] = s.label;
          fieldsToTranslate[`spec_${idx}_value`] = s.value;
        });
        const translations = await translateFieldsToArabic(fieldsToTranslate);
        const specsAr = (product.specifications as Array<any>).map((s: any, idx: number) => ({
          label: s.label,
          value: s.value,
          labelAr: translations[`spec_${idx}_label`] || '',
          valueAr: translations[`spec_${idx}_value`] || '',
        }));
        product.specificationsAr = specsAr;
      }
    } catch (err) {
      // Best-effort: don't fail the request on translation errors.
      console.error('[merchandise] on-the-fly specs translation failed', err);
    }
  }

  sendSuccess(res, product, t(lang, 'merchandise.product_details') || 'Product details retrieved');
});

export const createMerchandiseProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const user = await User.findById(userId).select('fullName role').lean();
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const data = req.body as any;
  const totalStock = calculateTotalStock(data.variants || []);

  const product = await MerchandiseProduct.create({
    // Attempt to auto-translate name/description/specifications to Arabic.
    ...(await (async () => {
      try {
        const fieldsToTranslate: Record<string, string | null | undefined> = {
          name: data.name,
          description: data.description,
        };
        // For specifications we translate label/value pairs, merging into keys like spec0_label, spec0_value
        if (Array.isArray(data.specifications)) {
          data.specifications.forEach((s: any, idx: number) => {
            fieldsToTranslate[`spec_${idx}_label`] = s.label;
            fieldsToTranslate[`spec_${idx}_value`] = s.value;
          });
        }
        const translations = await translateFieldsToArabic(fieldsToTranslate);
        // Map back specificationsAr
        if (Array.isArray(data.specifications)) {
          const specsAr: any[] = [];
          data.specifications.forEach((s: any, idx: number) => {
            const labelAr = translations[`spec_${idx}_label`];
            const valueAr = translations[`spec_${idx}_value`];
            specsAr.push({
              label: s.label,
              value: s.value,
              labelAr: labelAr || '',
              valueAr: valueAr || '',
            });
          });
          return { ...data, ...translations, specificationsAr: specsAr };
        }
        return { ...data, ...translations };
      } catch {
        return data;
      }
    })()),
    totalStock,
    createdBy: ensureObjectId(userId),
    vendorName: isVendorUser(req) ? String(user.fullName || '') : String(data.vendorName || ''),
  });

  sendSuccess(res, product, t(lang, 'merchandise.product_created') || 'Product created', 201);
});

export const updateMerchandiseProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const product = await MerchandiseProduct.findById(ensureObjectId(String(id)));

  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (!canModifyProduct(req, product)) {
    throw new AppError('Permission denied', 403);
  }

  const updateData = req.body as any;

  if (updateData.variants) {
    updateData.totalStock = calculateTotalStock(updateData.variants);
  }

  Object.assign(product, updateData);
  // If name/description/specifications changed, attempt Arabic translations
  if (updateData.name || updateData.description || updateData.specifications) {
    try {
      const fieldsToTranslate: Record<string, string | null | undefined> = {
        name: updateData.name ?? product.name,
        description: updateData.description ?? product.description,
      };
      if (Array.isArray(updateData.specifications)) {
        updateData.specifications.forEach((s: any, idx: number) => {
          fieldsToTranslate[`spec_${idx}_label`] = s.label;
          fieldsToTranslate[`spec_${idx}_value`] = s.value;
        });
      }
      const translations = await translateFieldsToArabic(fieldsToTranslate);
      Object.assign(product, translations);
      if (Array.isArray(updateData.specifications)) {
        const specsAr: any[] = [];
        updateData.specifications.forEach((s: any, idx: number) => {
          const labelAr = translations[`spec_${idx}_label`];
          const valueAr = translations[`spec_${idx}_value`];
          specsAr.push({ label: s.label, value: s.value, labelAr: labelAr || '', valueAr: valueAr || '' });
        });
        (product as any).specificationsAr = specsAr;
      }
    } catch {
      // ignore
    }
  }
  await product.save();

  sendSuccess(res, product, t(lang, 'merchandise.product_updated') || 'Product updated');
});

export const deleteMerchandiseProduct = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const product = await MerchandiseProduct.findById(ensureObjectId(String(id)));

  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (!canModifyProduct(req, product)) {
    throw new AppError('Permission denied', 403);
  }

  await product.deleteOne();
  sendSuccess(res, null, t(lang, 'merchandise.product_deleted') || 'Product deleted');
});

export const updateMerchandiseProductStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const { status } = req.body as { status: string };
  const product = await MerchandiseProduct.findById(ensureObjectId(String(id)));

  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (!canModifyProduct(req, product)) {
    throw new AppError('Permission denied', 403);
  }

  product.status = status as any;
  await product.save();

  sendSuccess(res, product, t(lang, 'merchandise.product_status_updated') || 'Product status updated');
});

export const updateMerchandiseProductFeatured = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const { featured } = req.body as { featured: boolean };
  const product = await MerchandiseProduct.findById(ensureObjectId(String(id)));

  if (!product) {
    throw new AppError('Product not found', 404);
  }
  if (!canModifyProduct(req, product)) {
    throw new AppError('Permission denied', 403);
  }

  product.featured = Boolean(featured);
  await product.save();

  sendSuccess(res, product, t(lang, 'merchandise.product_featured_updated') || 'Product featured state updated');
});

export const getMerchandiseCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const categories = await MerchandiseCategory.find().sort({ active: -1, name: 1 }).lean();
  categories.forEach((cat: any) => localizeMerchandiseCategoryStatic(cat, lang as any));
  sendSuccess(res, categories, 'Categories retrieved');
});

export const createMerchandiseCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const body = req.body as any;
  const id = buildSlugId(body.name);
  let categoryId = id;

  const existing = await MerchandiseCategory.findOne({ id: categoryId });
  if (existing) {
    categoryId = `${categoryId}-${Date.now()}`;
  }

  const category = await MerchandiseCategory.create({
    id: categoryId,
    name: body.name,
    nameAr: body.nameAr,
    icon: body.icon ?? '🏷️',
    image: body.image,
    active: body.active ?? true,
    subcategories: body.subcategories ?? [],
  });

  sendSuccess(res, category, t(lang, 'merchandise.category_created') || 'Category created', 201);
});

export const updateMerchandiseCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const body = req.body as any;
  const category = await MerchandiseCategory.findOne({ id: String(id) });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  if (body.name !== undefined) category.name = String(body.name);
  if (body.nameAr !== undefined) category.nameAr = String(body.nameAr);
  if (body.icon !== undefined) category.icon = String(body.icon);
  if (body.image !== undefined) category.image = String(body.image);
  if (body.active !== undefined) category.active = Boolean(body.active);
  if (body.subcategories !== undefined) category.subcategories = body.subcategories;

  await category.save();
  sendSuccess(res, category, t(lang, 'merchandise.category_updated') || 'Category updated');
});

export const deleteMerchandiseCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const category = await MerchandiseCategory.findOneAndDelete({ id: String(id) });

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  sendSuccess(res, null, t(lang, 'merchandise.category_deleted') || 'Category deleted');
});

export const getMerchandiseOrders = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { page = 1, limit = 20 } = req.query as any;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = buildOrderQuery(req.query);

  const [orders, total] = await Promise.all([
    MerchandiseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    MerchandiseOrder.countDocuments(filter),
  ]);

  sendSuccess(res, {
    items: orders,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum) || 1,
    },
  }, t(lang, 'merchandise.orders_list') || 'Orders retrieved');
});

export const getMerchandiseOrderById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const order = await MerchandiseOrder.findById(ensureObjectId(String(id))).lean();

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  sendSuccess(res, order, t(lang, 'merchandise.order_details') || 'Order details retrieved');
});

export const createMerchandiseOrder = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError('Authentication required', 401);
  }

  const user = await User.findById(userId).select('fullName profileImage email').lean();
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const body = req.body as any;
  const items = Array.isArray(body.items) ? body.items : [];

  for (const item of items) {
    const productId = String(item.productId || '');
    const requestedQuantity = Number(item.quantity || 0);
    if (!productId || requestedQuantity < 1) {
      throw new AppError('Invalid order item quantity or product ID', 400);
    }

    const product = await MerchandiseProduct.findById(ensureObjectId(productId))
      .select('name totalStock variants')
      .lean();

    if (!product) {
      throw new AppError(`Product not found: ${item.productName || productId}`, 404);
    }

    const normalizedSize = String(item.size ?? '').trim().toLowerCase();
    const normalizedColor = String(item.color ?? '').trim().toLowerCase();

    const variant = Array.isArray(product.variants)
      ? product.variants.find((variant) => {
          const variantSize = String(variant.size ?? '').trim().toLowerCase();
          const variantColor = String(variant.color ?? '').trim().toLowerCase();
          return variantSize === normalizedSize && variantColor === normalizedColor;
        })
      : undefined;

    let availableStock = 0;
    if (variant) {
      availableStock = Number(variant.stock || 0);
    } else if (Array.isArray(product.variants) && product.variants.length > 0) {
      availableStock = 0;
    } else {
      availableStock = Number(product.totalStock || 0);
    }

    if (requestedQuantity > availableStock) {
      const variantDesc = variant
        ? ` (${variant.size || 'default'} / ${variant.color || 'default'})`
        : '';
      throw new AppError(
        `Only ${availableStock} unit${availableStock === 1 ? '' : 's'} of ${product.name}${variantDesc} are available`,
        400,
      );
    }
  }

  const subtotal = items.reduce(
    (sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0,
  );
  const shipping = Number(body.shipping || 0);
  const total = subtotal + shipping;

  const order = await MerchandiseOrder.create({
    orderNumber: generateOrderNumber(),
    userId: ensureObjectId(userId),
    userName: String(user.fullName || 'Customer'),
    userAvatar: String(user.profileImage || ''),
    userEmail: String(user.email || ''),
    items,
    subtotal,
    shipping,
    total,
    status: 'pending',
    shippingAddress: body.shippingAddress,
    paymentMethod: body.paymentMethod,
    paymentLast4: body.paymentLast4 ? String(body.paymentLast4) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
  });

  sendSuccess(res, order, t(lang, 'merchandise.order_created') || 'Order created', 201);
});

export const updateMerchandiseOrderStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const { status } = req.body as { status: string };

  const order = await MerchandiseOrder.findById(ensureObjectId(String(id)));
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const previousStatus = String(order.status).toLowerCase();
  const nextStatus = String(status).toLowerCase();
  const previousStage = getOrderStatusStage(previousStatus);
  const nextStage = getOrderStatusStage(nextStatus);

  if (previousStatus !== nextStatus) {
    if (previousStage < 1 && nextStage >= 1) {
      await adjustStockForOrderItems(order.items, false);
    } else if (previousStage >= 1 && (nextStatus === 'cancelled' || nextStatus === 'refunded')) {
      await adjustStockForOrderItems(order.items, true);
    }
  }

  order.status = nextStatus as any;
  await order.save();

  sendSuccess(res, order, t(lang, 'merchandise.order_status_updated') || 'Order status updated');
});

export const updateMerchandiseOrderTracking = asyncHandler(async (req: AuthRequest, res: Response) => {
  const lang = ((req as any).lang || 'en') as string;
  const { id } = req.params;
  const { trackingNumber } = req.body as { trackingNumber: string };

  const order = await MerchandiseOrder.findById(ensureObjectId(String(id)));
  if (!order) {
    throw new AppError('Order not found', 404);
  }

  order.trackingNumber = String(trackingNumber);
  await order.save();

  sendSuccess(res, order, t(lang, 'merchandise.order_tracking_updated') || 'Tracking number updated');
});
