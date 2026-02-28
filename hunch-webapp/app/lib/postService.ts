import { prisma } from './db';
import { getFollowingIds } from './followService';
import { fetchMarketDetailsServer } from './dflowServer';
import { type Market } from './api';

export interface PostUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string;
}

export interface PostRecord {
  id: string;
  userId: string;
  content: string | null;
  postType: string;
  marketTicker: string | null;
  side: string | null;
  positionSize: number | null;
  entryPrice: number | null;
  createdAt: Date;
  updatedAt: Date;
  user: PostUser;
  marketDetails?: Market | null;
}

export interface CreatePostInput {
  content?: string;
  postType: 'text' | 'position_share';
  marketTicker?: string;
  side?: 'yes' | 'no';
  positionSize?: number;
  entryPrice?: number;
}

export interface GetPostsFeedParams {
  userId?: string;
  mode: 'global' | 'following';
  limit: number;
  offset: number;
}

const USER_SELECT = {
  id: true,
  displayName: true,
  avatarUrl: true,
  walletAddress: true,
} as const;

function serializePost(post: any): PostRecord {
  return {
    ...post,
    positionSize: post.positionSize ? Number(post.positionSize) : null,
    entryPrice: post.entryPrice ? Number(post.entryPrice) : null,
  };
}

export async function createPost(userId: string, input: CreatePostInput): Promise<PostRecord> {
  if (!input.content && input.postType === 'text') {
    throw new Error('Content is required for text posts');
  }
  if (input.postType === 'position_share' && !input.marketTicker) {
    throw new Error('marketTicker is required for position_share posts');
  }

  const post = await prisma.post.create({
    data: {
      userId,
      content: input.content ?? null,
      postType: input.postType,
      marketTicker: input.marketTicker ?? null,
      side: input.side ?? null,
      positionSize: input.positionSize ?? null,
      entryPrice: input.entryPrice ?? null,
    },
    include: { user: { select: USER_SELECT } },
  });

  return serializePost(post);
}

export async function getPostsFeed(params: GetPostsFeedParams): Promise<PostRecord[]> {
  const { userId, mode, limit, offset } = params;

  let userIdFilter: { in: string[] } | undefined;

  if (mode === 'following' && userId) {
    const followingIds = await getFollowingIds(userId);
    if (followingIds.length === 0) return [];
    userIdFilter = { in: followingIds };
  }

  const posts = await prisma.post.findMany({
    where: {
      isDeleted: false,
      ...(userIdFilter ? { userId: userIdFilter } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    include: { user: { select: USER_SELECT } },
  });

  const serialized = posts.map(serializePost);

  // Enrich position_share posts with market details (parallel, best-effort)
  const positionPosts = serialized.filter((p) => p.postType === 'position_share' && p.marketTicker);
  if (positionPosts.length > 0) {
    const tickers = [...new Set(positionPosts.map((p) => p.marketTicker!))];
    const marketResults = await Promise.allSettled(
      tickers.map((ticker) => fetchMarketDetailsServer(ticker))
    );
    const marketMap = new Map<string, Market>();
    tickers.forEach((ticker, i) => {
      const r = marketResults[i];
      if (r.status === 'fulfilled' && r.value) marketMap.set(ticker, r.value);
    });
    for (const post of serialized) {
      if (post.postType === 'position_share' && post.marketTicker) {
        post.marketDetails = marketMap.get(post.marketTicker) ?? null;
      }
    }
  }

  return serialized;
}

export async function deletePost(postId: string, userId: string): Promise<void> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');
  if (post.userId !== userId) throw new Error('Forbidden');

  await prisma.post.update({
    where: { id: postId },
    data: { isDeleted: true },
  });
}
