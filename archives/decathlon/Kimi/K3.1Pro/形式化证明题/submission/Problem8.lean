import Mathlib.Combinatorics.Additive.ErdosGinzburgZiv
import Mathlib.FieldTheory.Finite.GaloisField
import Mathlib.Tactic

open scoped BigOperators
open Finset Polynomial

private lemma exists_pow_weights (p N : ℕ) [Fact p.Prime]
    (B : Finset (Finset (Fin N))) :
    ∃ e : ℕ, ∃ α : GaloisField p e, ∀ S ∈ B, S.Nonempty → ∑ i ∈ S, α ^ (i : ℕ) ≠ 0 := by
  classical
  let Q : Finset (Fin N) → (ZMod p)[X] := fun S => ∑ i ∈ S, X ^ (i : ℕ)
  have hQ : ∀ S ∈ B, S.Nonempty → Q S ≠ 0 := by
    intro S hBS hS hzero
    obtain ⟨i, hi⟩ := hS
    have hc := congrArg (fun P : (ZMod p)[X] => P.coeff i) hzero
    simp [Q, hi, Fin.val_inj] at hc
  let P : (ZMod p)[X] := ∏ S ∈ B.filter (fun S => S.Nonempty), Q S
  have hP : P ≠ 0 := by
    apply Finset.prod_ne_zero_iff.mpr
    intro S hS
    rw [mem_filter] at hS
    exact hQ S hS.1 hS.2
  obtain ⟨e, he⟩ := pow_unbounded_of_one_lt (P.natDegree + 1) (Fact.out : p.Prime).one_lt
  have he0 : e ≠ 0 := by
    intro h
    subst e
    simp at he
  let K := GaloisField p e
  letI : Fintype K := Fintype.ofFinite K
  let φ := algebraMap (ZMod p) K
  have hφ : Function.Injective φ := FaithfulSMul.algebraMap_injective (ZMod p) K
  have hcard : (P.map φ).natDegree < Fintype.card K := by
    rw [Polynomial.natDegree_map_eq_of_injective hφ, ← Nat.card_eq_fintype_card,
      show K = GaloisField p e from rfl, GaloisField.card p e he0]
    omega
  have hcard' : ((P.map φ).natDegree : Cardinal) < Cardinal.mk K := by
    simpa only [Cardinal.mk_fintype, Nat.cast_lt] using hcard
  have hmapP : P.map φ ≠ 0 := Polynomial.map_ne_zero_iff hφ |>.mpr hP
  obtain ⟨α, hα⟩ := Polynomial.exists_eval_ne_zero_of_natDegree_lt_card (P.map φ) hmapP hcard'
  refine ⟨e, α, ?_⟩
  intro S hBS hS
  have hmem : S ∈ B.filter (fun S => S.Nonempty) := mem_filter.mpr ⟨hBS, hS⟩
  have hfactor : Q S ∣ P := Finset.dvd_prod_of_mem Q hmem
  intro hsum
  apply hα
  obtain ⟨R, hR⟩ := hfactor
  have hzero : ((Q S).map φ).eval α = 0 := by
    simp [Q, Polynomial.eval_map, Polynomial.eval₂_finsetSum, hsum]
  have heval : (P.map φ).eval α = 0 := by
    rw [hR, Polynomial.map_mul, eval_mul, hzero, zero_mul]
  exact heval

private theorem kemnitz_prime (p : ℕ) [Fact p.Prime]
    (f : Fin (4 * p - 3) → ZMod p × ZMod p) :
    ∃ s : Finset (Fin (4 * p - 3)), s.card = p ∧ ∑ i ∈ s, f i = 0 := by
  sorry

theorem problem8 (n : ℕ) (hn : 1 ≤ n)
    (f : Fin (4 * n - 3) → ZMod n × ZMod n) :
    ∃ s : Finset (Fin (4 * n - 3)),
      s.card = n ∧ ∑ i ∈ s, f i = 0 := by
  sorry
