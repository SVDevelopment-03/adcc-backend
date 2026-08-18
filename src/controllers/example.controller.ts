import { Request, Response } from "express";
import Example from "../models/example.model";
import { sendSuccess } from "@/utils/response";
import { asyncHandler } from "@/utils/async-handler";


// export const getExamples = asyncHandler(async (_req: Request, res: Response) => {
//   try {
//     const examples = await Example.find();
//     sendSuccess(res, examples, "Examples fetched successfully");
//   } catch (error: any) {
//     throw new AppError(error.message, 500);
//   }
// });

export const getExamples = asyncHandler(async (_req: Request, res: Response) => {
    const examples = await Example.find();
    sendSuccess(res, examples);
  });

export const createExample = asyncHandler(async (req: Request, res: Response) => {
 
    const { name, email } = req.body;
    const example = await Example.create({ name, email });
    sendSuccess(res, example, "Example created successfully");
 
});
