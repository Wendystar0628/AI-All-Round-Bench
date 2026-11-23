import Mathlib.Data.Finset.Powerset
import Mathlib.Data.Finset.Lattice.Fold
import Mathlib.Algebra.BigOperators.Group.Finset.Basic
import Mathlib.Tactic

lemma family_bound_of_large_average {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (U : Finset α)
    (hsub : ∀ a ∈ A, a ⊆ U)
    (havg : A.card * U.card ≤ 2 * ∑ a ∈ A, a.card) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  have hcard : A.card ≤ 2 ^ U.card := by
    calc
      A.card ≤ U.powerset.card := Finset.card_le_card (by
        intro a ha
        exact Finset.mem_powerset.mpr (hsub a ha))
      _ = 2 ^ U.card := Finset.card_powerset U
  calc
    A.card ^ A.card ≤ (2 ^ U.card) ^ A.card := Nat.pow_le_pow_left hcard _
    _ = 2 ^ (A.card * U.card) := by rw [← pow_mul, Nat.mul_comm]
    _ ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := Nat.pow_le_pow_right (by decide) havg

lemma union_closed_has_greatest {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) :
    ∃ U ∈ A, ∀ a ∈ A, a ⊆ U := by
  classical
  refine ⟨A.sup' hA id, ?_, ?_⟩
  · refine Finset.sup'_mem (A : Set (Finset α)) ?_ A hA id ?_
    · intro a ha b hb
      exact hunion a ha b hb
    · intro a ha
      exact ha
  · intro a ha
    exact Finset.le_sup' id ha