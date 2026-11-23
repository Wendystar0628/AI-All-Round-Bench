import Mathlib.Analysis.Complex.Basic
import Mathlib.LinearAlgebra.Matrix.Rank
import Mathlib.LinearAlgebra.Matrix.FiniteDimensional
import Mathlib.LinearAlgebra.Dimension.Constructions

/-
Partial work for Problem 4. The intermediate-rank dimension bound and its equality
classification are not proved here. Both endpoint ranks are covered below.
-/

theorem problem4_ambient_bound (n : ℕ)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ)) :
    Module.finrank ℂ S ≤ n * n := by
  have h := Submodule.finrank_le S
  simpa [Module.finrank_matrix] using h

theorem problem4_full_rank (n : ℕ)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ)) :
    Module.finrank ℂ S ≤ n * n ∧
      (∃ U : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ U = n ∧
        ∀ A ∈ S, LinearMap.range A.mulVecLin ≤ U) := by
  refine ⟨problem4_ambient_bound n S, ⊤, ?_, fun A hA => le_top⟩
  simp

theorem problem4_matrix_rank_zero (n : ℕ) (A : Matrix (Fin n) (Fin n) ℂ)
    (hA : A.rank = 0) : A = 0 := by
  have hdim : Module.finrank ℂ (LinearMap.range A.mulVecLin) = 0 := hA
  have hrange : LinearMap.range A.mulVecLin = ⊥ := Submodule.finrank_eq_zero.mp hdim
  have hlin : A.mulVecLin = 0 := LinearMap.range_eq_bot.mp hrange
  ext i j
  have hv : A.mulVecLin (Pi.single j 1) = 0 := by rw [hlin]; rfl
  have he := congrArg (fun v : Fin n → ℂ => v i) hv
  simpa [Matrix.mulVecLin_apply, Matrix.mulVec_single_one, Matrix.col_apply] using he

theorem problem4_zero_rank (n : ℕ)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ))
    (hS : ∀ A ∈ S, A.rank ≤ 0) :
    Module.finrank ℂ S = 0 ∧
      (∃ U : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ U = 0 ∧
        ∀ A ∈ S, LinearMap.range A.mulVecLin ≤ U) := by
  have hzero : ∀ A ∈ S, A = 0 := by
    intro A hA
    exact problem4_matrix_rank_zero n A (Nat.eq_zero_of_le_zero (hS A hA))
  have hbot : S = ⊥ := by
    apply le_antisymm
    · intro A hA
      exact (Submodule.mem_bot ℂ).mpr (hzero A hA)
    · exact bot_le
  refine ⟨by simp [hbot], ⊥, by simp, ?_⟩
  intro A hA
  rw [hzero A hA, Matrix.mulVecLin_zero, LinearMap.range_zero]
