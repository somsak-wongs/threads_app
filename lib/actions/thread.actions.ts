'use server';

import { revalidatePath } from 'next/cache';
import Thread from '../models/thread.model';
import User from '../models/user.model';
import { connectToDB } from '../mongoose';
import { string } from 'zod';

interface Params {
	text: string;
	author: string;
	communityId: string | null;
	path: string;
}

export const createThread = async ({ text, author, communityId, path }: Params) => {
	connectToDB();

	try {
		const createdThread = await Thread.create({
			text,
			author,
			community: null,
		});
		await User.findByIdAndUpdate(author, {
			$push: { threads: createdThread._id },
		});

		revalidatePath(path);
	} catch (error: any) {
		throw new Error(`Failed to create thread ${error.message}`);
	}
};

export const fetchThreads = async (pageNumber = 1, pageSize = 20) => {
	connectToDB();

	try {
		const skipAmount = (pageNumber - 1) * pageSize;

		const threadsQuery = Thread.find({
			parentId: { $in: [null, undefined] },
		})
			.sort({ createdAt: 'desc' })
			.skip(skipAmount)
			.limit(pageSize)
			.populate({ path: 'author', model: User })
			.populate({
				path: 'children',
				populate: {
					path: 'author',
					model: User,
					select: '_id name parentId image',
				},
			});

		const totalThreadCount = await Thread.countDocuments({
			parentId: { $in: [null, undefined] },
		});

		const threads = await threadsQuery.exec();
		const isNext = totalThreadCount > skipAmount + threads.length;

		return { threads, isNext };
	} catch (error: any) {
		throw new Error(`Failed to fetch threads ${error.message}`);
	}
};

export const fetchThreadById = async (id: string) => {
	connectToDB();

	try {
		const thread = await Thread.findById(id)
			.populate({
				path: 'author',
				model: User,
				select: '_id id name image',
			})
			.populate({
				path: 'children',
				populate: [
					{
						path: 'author',
						model: User,
						select: '_id id name parentId image',
					},
					{
						path: 'children',
						model: Thread,
						populate: {
							path: 'author',
							model: User,
							select: '_id id name parentId image',
						},
					},
				],
			})
			.exec();

		return thread;
	} catch (error: any) {
		throw new Error(`Failed to fetch thread ${error.message}`);
	}
};

export const addCommentToThread = async ({
	threadId,
	commentText,
	userId,
	path,
}: {
	threadId: string;
	commentText: string;
	userId: string;
	path: string;
}) => {
	connectToDB();

	try {
		const originalThread = await Thread.findById(threadId);
		if (!originalThread) {
			throw new Error('Thread not found');
		}

		const commentThread = new Thread({
			text: commentText,
			author: userId,
			parentId: threadId,
		});

		const saveCommentThread = await commentThread.save();
		originalThread.children.push(saveCommentThread._id);

		await originalThread.save();

		revalidatePath(path);
	} catch (error: any) {
		throw new Error(`Failed to add comment to thread ${error.message}`);
	}
};
