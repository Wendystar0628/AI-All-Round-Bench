import Mathlib.Data.Finset.Powerset
import Mathlib.Data.Finset.Union
import Mathlib.Algebra.Order.BigOperators.Group.Finset
import Mathlib.Tactic.Linarith

open Finset

/-
Partial work for Problem 3. The general Reimer inequality is not proved here.
The lemmas below establish the finite ground-set bound and the cases of at most two sets.
-/

theorem problem3_ground_bound {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) : A.card ≤ 2 ^ (A.biUnion id).card := by
  calc
    A.card ≤ ((A.biUnion id).powerset).card := by
      apply card_le_card
      intro a ha
      exact mem_powerset.mpr (subset_biUnion_of_mem id ha)
    _ = _ := card_powerset _

theorem problem3_small {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hsmall : A.card ≤ 2) :
    A.card ^ A.card ≤ 2 ^ (2 * ∑ a ∈ A, a.card) := by
  have hcases : A.card = 0 ∨ A.card = 1 ∨ A.card = 2 := by omega
  rcases hcases with h0 | h1 | h2
  · have hA : A = ∅ := card_eq_zero.mp h0
    simp [hA]
  · rw [h1]
    simp only [one_pow]
    exact Nat.one_le_pow _ _ (by omega)
  · have hsum : 1 ≤ ∑ a ∈ A, a.card := by
      by_contra! h
      have hzero : ∑ a ∈ A, a.card = 0 := by omega
      have hall : ∀ a ∈ A, a = ∅ := by
        intro a ha
        apply card_eq_zero.mp
        have hle : a.card ≤ ∑ b ∈ A, b.card :=
          single_le_sum (fun b hb => Nat.zero_le _) ha
        omega
      have hsub : A ⊆ {∅} := by
        intro a ha
        simpa using hall a ha
      have hc := card_le_card hsub
      simp only [card_singleton, h2] at hc
      omega
    rw [h2]
    exact (show (2 : ℕ) ^ 2 ≤ 2 ^ (2 * ∑ a ∈ A, a.card) from
      Nat.pow_le_pow_right (by omega) (by omega))

theorem problem3_union_mem {α : Type*} [DecidableEq α]
    (A : Finset (Finset α)) (hA : A.Nonempty)
    (hunion : ∀ a ∈ A, ∀ b ∈ A, a ∪ b ∈ A) : A.biUnion id ∈ A := by
  obtain ⟨a, ha⟩ := hA
  have haux : ∀ B : Finset (Finset α), B ⊆ A → a ∪ B.biUnion id ∈ A := by
    intro B
    induction B using Finset.induction_on with
    | empty => intro h; simpa using ha
    | @insert b B hb ih =>
      intro hBA
      have hp := ih (subset_trans (subset_insert b B) hBA)
      have hbA := hBA (mem_insert_self b B)
      have h := hunion (a ∪ B.biUnion id) hp b hbA
      simpa [biUnion_insert, union_assoc, union_comm, union_left_comm] using h
  have h := haux A subset_rfl
  have he : a ∪ A.biUnion id = A.biUnion id :=
    union_eq_right.mpr (subset_biUnion_of_mem id ha)
  rw [he] at h
  exact h
