import mongoose, { Schema, Document } from 'mongoose';

export type MerchandiseOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface IMerchandiseOrderItem {
  productId: string;
  productName: string;
  productImage: string;
  size?: string;
  color?: string;
  price: number;
  quantity: number;
}

export interface IMerchandiseOrder extends Document {
  orderNumber: string;
  userId: mongoose.Types.ObjectId;
  userName: string;
  userAvatar: string;
  userEmail: string;
  items: IMerchandiseOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  status: MerchandiseOrderStatus;
  shippingAddress: {
    name: string;
    line1: string;
    city: string;
    emirate: string;
    phone: string;
  };
  paymentMethod: string;
  paymentLast4?: string;
  trackingNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MerchandiseOrderItemSchema = new Schema(
  {
    productId: {
      type: String,
      required: [true, 'Product ID is required'],
      trim: true,
    },
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    productImage: {
      type: String,
      trim: true,
      default: '',
    },
    size: {
      type: String,
      trim: true,
      default: '',
    },
    color: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
  },
  { _id: false }
);

const MerchandiseOrderSchema = new Schema<IMerchandiseOrder>(
  {
    orderNumber: {
      type: String,
      required: [true, 'Order number is required'],
      trim: true,
      unique: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: [true, 'Order user is required'],
    },
    userName: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    userAvatar: {
      type: String,
      trim: true,
      default: '',
    },
    userEmail: {
      type: String,
      required: [true, 'User email is required'],
      trim: true,
    },
    items: {
      type: [MerchandiseOrderItemSchema],
      required: [true, 'Order items are required'],
      validate: {
        validator: (items: IMerchandiseOrderItem[]) => Array.isArray(items) && items.length > 0,
        message: 'At least one order item is required',
      },
    },
    subtotal: {
      type: Number,
      required: [true, 'Order subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
    shipping: {
      type: Number,
      required: [true, 'Shipping amount is required'],
      min: [0, 'Shipping cannot be negative'],
      default: 0,
    },
    total: {
      type: Number,
      required: [true, 'Order total is required'],
      min: [0, 'Total cannot be negative'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
    },
    shippingAddress: {
      name: { type: String, required: [true, 'Shipping name is required'], trim: true },
      line1: { type: String, required: [true, 'Shipping address is required'], trim: true },
      city: { type: String, required: [true, 'Shipping city is required'], trim: true },
      emirate: { type: String, required: [true, 'Shipping emirate is required'], trim: true },
      phone: { type: String, required: [true, 'Shipping phone is required'], trim: true },
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      trim: true,
    },
    paymentLast4: {
      type: String,
      trim: true,
      default: '',
    },
    trackingNumber: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

MerchandiseOrderSchema.index({ status: 1 });
MerchandiseOrderSchema.index({ userId: 1 });

export default mongoose.model<IMerchandiseOrder>('merchandise_orders', MerchandiseOrderSchema);
