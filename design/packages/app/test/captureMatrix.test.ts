import { describe, expect, it } from "vitest";

import {
    CAPTURE_COMMIT_PROVENANCE_CONTRACT,
    CAPTURE_COMMIT_PROVENANCE_PLACEHOLDER,
    CAPTURE_MATRIX,
    CAPTURE_MATRIX_FIELDS,
    EXPECTED_CAPTURE_NAMES,
    validateCaptureMatrix,
} from "./captureMatrix.js";

function mutableMatrix(): Record<string, unknown>[] {
    return CAPTURE_MATRIX.map((entry) => ({ ...entry }));
}

describe("the hand-written capture matrix", () => {
    it("contains exactly the expected capture states with complete valid metadata", () => {
        expect(CAPTURE_MATRIX).toHaveLength(EXPECTED_CAPTURE_NAMES.length);
        expect(validateCaptureMatrix(CAPTURE_MATRIX)).toEqual([]);
    });

    it("turns red when any declared capture entry is removed, then green when restored", () => {
        for (let index = 0; index < CAPTURE_MATRIX.length; index += 1) {
            const matrix = mutableMatrix();
            const [removed] = matrix.splice(index, 1);
            expect(removed).toBeDefined();

            const name = removed!.name as string;
            expect(validateCaptureMatrix(matrix)).toContain(`missing required capture '${name}'`);

            matrix.splice(index, 0, removed!);
            expect(validateCaptureMatrix(matrix)).toEqual([]);
        }
    });

    it("turns red when any required metadata field is removed, then green when restored", () => {
        for (let index = 0; index < CAPTURE_MATRIX.length; index += 1) {
            for (const field of CAPTURE_MATRIX_FIELDS) {
                const matrix = mutableMatrix();
                const saved = matrix[index]![field];
                delete matrix[index]![field];

                expect(validateCaptureMatrix(matrix)).toContain(
                    `entry[${index}] is missing required field '${field}'`,
                );

                matrix[index]![field] = saved;
                expect(validateCaptureMatrix(matrix)).toEqual([]);
            }
        }
    });

    it("accepts only the planning placeholder or an exact resolved commit", () => {
        expect(CAPTURE_COMMIT_PROVENANCE_CONTRACT).toContain(CAPTURE_COMMIT_PROVENANCE_PLACEHOLDER);

        const resolved = mutableMatrix();
        resolved[0]!.commitProvenance = "0123456789abcdef0123456789abcdef01234567";
        expect(validateCaptureMatrix(resolved)).toEqual([]);

        const ambiguous = mutableMatrix();
        ambiguous[0]!.commitProvenance = "main";
        expect(validateCaptureMatrix(ambiguous)).toContain(
            "entry[0] commitProvenance must be the placeholder or a full lowercase commit",
        );
    });

    it("keeps soft skips explicit and refuses to disguise them as required captures", () => {
        const softSkipIndex = CAPTURE_MATRIX.findIndex(
            (entry) => entry.classification === "soft-skip",
        );
        expect(softSkipIndex).toBeGreaterThanOrEqual(0);
        expect(CAPTURE_MATRIX[softSkipIndex]!.file).toBeNull();

        const missingReason = mutableMatrix();
        missingReason[softSkipIndex]!.softSkipReason = null;
        expect(validateCaptureMatrix(missingReason)).toContain(
            `entry[${softSkipIndex}] soft-skip capture must name its external precondition`,
        );

        const inventedFile = mutableMatrix();
        inventedFile[softSkipIndex]!.file = `${inventedFile[softSkipIndex]!.name}.png`;
        expect(validateCaptureMatrix(inventedFile)).toContain(
            `entry[${softSkipIndex}] soft-skip capture must use a null file`,
        );

        const requiredWithExcuse = mutableMatrix();
        requiredWithExcuse[0]!.softSkipReason = "an excuse that must not weaken a required state";
        expect(validateCaptureMatrix(requiredWithExcuse)).toContain(
            "entry[0] required capture must use a null softSkipReason",
        );
    });
});
