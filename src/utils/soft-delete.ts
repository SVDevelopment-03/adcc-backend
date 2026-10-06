import mongoose, { Schema } from 'mongoose';

/**
 * Soft delete ("Trash") support shared by events, communities and tracks.
 *
 * A trashed document keeps all of its data and only gets `deletedAt` set, so it
 * can be restored later. Every read/update query on a model using this plugin
 * skips trashed documents automatically — the public site, the mobile app and
 * the dashboard lists never see them — unless the query filters on `deletedAt`
 * itself (see ONLY_TRASHED / WITH_TRASHED below).
 */

/** Filter fragment: only documents that are in the Trash. */
export const ONLY_TRASHED = { deletedAt: { $ne: null } };

/** Filter fragment: live and trashed documents alike. */
export const WITH_TRASHED = { deletedAt: { $nin: [] as unknown[] } };

const QUERY_HOOKS = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'findOneAndUpdate',
  'updateOne',
  'updateMany',
];

export const softDeletePlugin = (schema: Schema): void => {
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'users', default: null },
  });

  schema.pre(QUERY_HOOKS as any, function (this: mongoose.Query<unknown, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(this.getFilter(), 'deletedAt')) {
      this.where({ deletedAt: null });
    }
  });

  schema.pre('aggregate', function () {
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });
};

/** Moves a document to the Trash. Returns null when it doesn't exist or is already trashed. */
export const moveToTrash = <T>(model: mongoose.Model<T>, id: string, userId?: string) =>
  model.findOneAndUpdate(
    { _id: id } as any,
    { $set: { deletedAt: new Date(), deletedBy: userId ?? null } } as any,
    { new: true }
  );

/** Takes a document back out of the Trash. Returns null when it isn't in the Trash. */
export const restoreFromTrash = <T>(model: mongoose.Model<T>, id: string) =>
  model.findOneAndUpdate(
    { _id: id, ...ONLY_TRASHED } as any,
    { $set: { deletedAt: null, deletedBy: null } } as any,
    { new: true }
  );

/** Permanently removes a document — only allowed once it is in the Trash. */
export const deleteFromTrash = <T>(model: mongoose.Model<T>, id: string) =>
  model.findOneAndDelete({ _id: id, ...ONLY_TRASHED } as any);
