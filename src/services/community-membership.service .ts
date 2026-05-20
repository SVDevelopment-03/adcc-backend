import CommunityMembership from '@/models/communityMembership.model';
import Community from '@/models/community.model';
import User from '@/models/user.model';
import { AppError } from '@/utils/app-error';
import { notifyAdminCommunityMember } from '@/services/admin-notification.service';

export class CommunityMembershipService {
  /**
   * Add user to community
   * 
   */

  async joinCommunity(userId: string, communityId: any) {
    // convert strings to ObjectId where needed for arrays
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const community = await Community.findById(communityId);
    if (!community) {
      throw new AppError('Community not found', 404);
    }

    const alreadyMember = await CommunityMembership.findOne({ userId, communityId });

    if (alreadyMember) {
      // toggle off if active
      if (alreadyMember.status === 'active') {
        alreadyMember.status = 'inactive';
        await alreadyMember.save();
      

        // atomically pull from members array (skip validation)
        await Community.findByIdAndUpdate(communityId, { $pull: { members: userId } });

        return alreadyMember.populate('userId', 'fullName email');
      }

      // reactivate if inactive
      if (alreadyMember.status === 'inactive') {
        alreadyMember.status = 'active';
        await alreadyMember.save();

        // atomically add to members set
        await Community.findByIdAndUpdate(communityId, { $addToSet: { members: userId } });

        const rejoinUser = await User.findById(userId).select('fullName').lean();
        if (rejoinUser && community.title) {
          void notifyAdminCommunityMember({
            communityTitle: community.title,
            memberName: rejoinUser.fullName?.trim() || 'Member',
            communityId: String(communityId),
          });
        }

        return alreadyMember.populate('userId', 'fullName email');
      }

      // banned users cannot toggle
      if (alreadyMember.status === 'banned') {
        throw new AppError('Banned users cannot join or leave the community', 400);
      }
    }

    const membership = await CommunityMembership.create({
      userId,
      communityId,
      role: 'member',
      status: 'active',
    });

    // atomically add new member (in case document was modified externally)
    await Community.findByIdAndUpdate(communityId, { $addToSet: { members: userId } });

    const newMemberUser = await User.findById(userId).select('fullName').lean();
    if (newMemberUser && community.title) {
      void notifyAdminCommunityMember({
        communityTitle: community.title,
        memberName: newMemberUser.fullName?.trim() || 'Member',
        communityId: String(communityId),
      });
    }

    return membership.populate('userId', 'fullName email');
}

 /**
  * Remove user from community
  * 
  * */

  async leaveCommunity(userId: string, communityId: any) {
  if (!userId) {
    throw new AppError('User not authenticated', 401);
  }

  const membership = await CommunityMembership.findOne({
    userId,
    communityId,
  });

  if (!membership) {
    throw new AppError('User is not a member of community', 404);
  }

  if (membership.status !== 'inactive') {
    membership.status = 'inactive';
    await membership.save();

    await Community.findByIdAndUpdate(
      communityId,
      { $pull: { members: userId } }
    );
  }

  // ✅ Always return same structure
  const populatedMembership = await membership.populate('userId', 'name email');

  const community = await Community.findById(communityId)
    .select('title city category')  
    .populate('createdBy', 'fullName email')
    .populate('members', 'fullName email');

  return {
    membership: populatedMembership,
    community,
  };
}


    /*
    * Get community members
    */
  async getCommunityMembers( id: string, page: number = 1, limit: number = 10 ) {
    
    const skip = (page - 1) * limit;

    const filter = { communityId: id };

    const [members, totalMembers] = await Promise.all([
      CommunityMembership.find(filter as any)
        .select('userId role status joinedAt') 
        .populate('userId', 'fullName email')
        .sort({ joinedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      CommunityMembership.countDocuments(filter as any),
    ]);

    return {
      members,
      pagination: {
        total: totalMembers,
        page,
        limit,
        pages: Math.ceil(totalMembers / limit),
      },
    };
  }

  /*
  * Get user communities
  */
 async getUserCommunities(userId: string) {

  const memberships = await CommunityMembership.find({ userId, status: 'active' } as any
  ).populate('communityId');

  if(!memberships) {
    throw new AppError('User is not a member of any communities', 404);
  }
  return memberships;

}

  /**
   * Get current user's joined communities (paginated).
   * Returns empty list when user has no memberships; does not throw.
   */
  async getMyJoinedCommunities(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const filter = { userId, status: 'active' };

    const [memberships, total] = await Promise.all([
      CommunityMembership.find(filter as any)
        .select('communityId joinedAt role')
        .populate('communityId', 'title description image location city memberCount type category slug')
        .sort({ joinedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CommunityMembership.countDocuments(filter as any),
    ]);

    const communities = memberships.map((m: any) => ({
      community: m.communityId,
      joinedAt: m.joinedAt,
      role: m.role,
    }));

    return {
      communities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    };
  }

/*
* Get banned members of a community
*/ 
async getBannedMembers(communityId: any) {
  const bannedMembers = await CommunityMembership.find({ communityId, status: 'banned' } as any)
    .populate('userId', 'fullName email');

  if(!bannedMembers) {
    throw new AppError('No banned members found for this community', 404);
  }
  return bannedMembers;
}

/*
* Check if user is member of community
*/
async isMember(userId: string, communityId: any) {
  const membership = await CommunityMembership.findOne({ userId, communityId, status: 'active' } as any);
  return !!membership;
}

}