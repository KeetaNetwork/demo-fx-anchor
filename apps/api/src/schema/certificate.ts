import * as v from "valibot";

const requiredString = v.pipe(v.string("Required"), v.minLength(1, "Required"));

export const certificateSchema = v.object({
	requestId: requiredString,
	fullName: requiredString,
	email: v.pipe(requiredString, v.email("Invalid email address")),
	phoneNumber: v.string("Invalid phone number"),
	address: v.string("Invalid address"),
	dateOfBirth: v.optional(v.pipe(v.string())),
	validUntil: v.optional(v.string("Invalid date")),
});
export type Certificate = v.InferOutput<typeof certificateSchema>;
