import Mathlib.LinearAlgebra.Matrix.Rank
import Mathlib.LinearAlgebra.Matrix.SchurComplement
import Mathlib.LinearAlgebra.Matrix.PosDef
import Mathlib.LinearAlgebra.Complex.FiniteDimensional
import Mathlib.Topology.Instances.Matrix
import Mathlib.Tactic

open Matrix Module Filter
open scoped Topology Matrix ComplexOrder
namespace BoundedRank
variable {I J : Type} [Fintype I] [Fintype J] [DecidableEq I] [DecidableEq J]
private abbrev Mat (I J : Type) := Matrix I J ℂ
private abbrev Sq (I : Type) := Mat I I
private abbrev pivot : Sq (I ⊕ J) := fromBlocks 1 0 0 0

private lemma schur (P : Sq I) (Q : Mat I J) (R : Mat J I) (D : Sq J)
    (hu : IsUnit P) (hr : (fromBlocks P Q R D).rank ≤ Fintype.card I) :
    D = R * P⁻¹ * Q := by
  classical
  letI := hu.invertible
  ext i j
  let f (i : J) : I ⊕ Unit → I ⊕ J := Sum.map id (fun _ => i)
  let M := fromBlocks P (Q.submatrix id (fun _ : Unit => j))
    (R.submatrix (fun _ : Unit => i) id) (D.submatrix (fun _ : Unit => i) (fun _ : Unit => j))
  have he : M = (fromBlocks P Q R D).submatrix (f i) (f j) := by
    ext (a|a) (b|b) <;> rfl
  have hM : M.det = 0 := by
    by_contra h
    have h1 := rank_of_isUnit M ((isUnit_iff_isUnit_det _).mpr (isUnit_iff_ne_zero.mpr h))
    have h2 := rank_submatrix_le (fromBlocks P Q R D) (f i) (f j)
    rw [← he,h1,Fintype.card_sum,Fintype.card_unit] at h2
    omega
  rw [show M = _ from rfl, det_fromBlocks₁₁, det_unique (n := Unit), invOf_eq_nonsing_inv] at hM
  have H := (mul_eq_zero.mp hM).resolve_left ((isUnit_iff_isUnit_det P).mp hu).ne_zero
  simpa [Matrix.mul_apply,M] using sub_eq_zero.mp H

private lemma regular (P : Sq I) :
    ∀ᶠ t : ℂ in 𝓝[≠] 0, IsUnit (1 + t • P) := by
  have h : Continuous (fun t : ℂ => (1 + t • P).det) := by fun_prop
  have H := h.continuousAt.eventually_ne (x := 0) (y := 0) (by simp)
  filter_upwards [H.filter_mono nhdsWithin_le_nhds] with t ht
  exact (isUnit_iff_isUnit_det _).mpr (isUnit_iff_ne_zero.mpr ht)

private lemma tangent (P : Sq I) (Q : Mat I J) (R : Mat J I) (D : Sq J)
    (hr : ∀ t : ℂ, (fromBlocks (1 + t • P) (t • Q) (t • R) (t • D)).rank ≤ Fintype.card I) :
    D = 0 ∧ R * Q = 0 := by
  let F (t : ℂ) := R * (1 + t • P)⁻¹ * Q
  have hi : ContinuousAt (Inv.inv : Sq I → Sq I) 1 := continuousAt_matrix_inv _ (by
    rw [Ring.inverse_eq_inv']; exact continuousAt_inv₀ (by simp))
  have hP : ContinuousAt (fun t : ℂ => 1+t • P) 0 := by fun_prop
  have hF : ContinuousAt F 0 := by
    have H : Continuous (fun K : Sq I => R*K*Q) := by fun_prop
    change ContinuousAt ((fun K : Sq I => R*K*Q) ∘ Inv.inv ∘ (fun t : ℂ => 1+t • P)) 0
    apply H.continuousAt.comp
    exact (show ContinuousAt (Inv.inv : Sq I → Sq I) (1+(0:ℂ) • P) by simpa using hi).comp (f := fun t : ℂ => 1+t • P) hP
  have hne : ∀ᶠ t : ℂ in 𝓝[≠] 0, t ≠ 0 := self_mem_nhdsWithin
  have H : ∀ᶠ t : ℂ in 𝓝[≠] 0, D = t • F t := by
    filter_upwards [regular P,hne] with t ht ht'
    have hh := schur _ _ _ _ ht (hr t)
    rw [Matrix.smul_mul,Matrix.smul_mul,Matrix.mul_smul] at hh
    exact (smul_right_injective _ ht') hh
  have hD : D = 0 := by
    have h0 := (continuousAt_id.smul hF).continuousWithinAt (s := ({0} : Set ℂ)ᶜ)
    have hh := tendsto_nhds_unique_of_eventuallyEq tendsto_const_nhds h0 H
    simpa using hh
  refine ⟨hD,?_⟩
  have H' : ∀ᶠ t : ℂ in 𝓝[≠] 0, F t = 0 := by
    filter_upwards [H,hne] with t ht ht'
    exact (smul_eq_zero.mp (ht.symm.trans hD)).resolve_left ht'
  have hh := tendsto_nhds_unique_of_eventuallyEq
    (hF.continuousWithinAt (s := ({0} : Set ℂ)ᶜ)) tendsto_const_nhds H'
  simpa [F] using hh

private lemma blocks {S : Submodule ℂ (Sq (I ⊕ J))} (h0 : pivot ∈ S)
    (hr : ∀ A ∈ S, A.rank ≤ Fintype.card I) {A : Sq (I ⊕ J)} (ha : A ∈ S) :
    A.toBlocks₂₂ = 0 ∧ A.toBlocks₂₁ * A.toBlocks₁₂ = 0 := by
  apply tangent A.toBlocks₁₁
  intro t
  apply hr
  have H := S.add_mem h0 (S.smul_mem t ha)
  change fromBlocks 1 0 0 0 + t • A ∈ S at H
  rw [← fromBlocks_toBlocks A,fromBlocks_smul,fromBlocks_add,zero_add,zero_add,zero_add] at H
  exact H

private lemma normalized (S : Submodule ℂ (Sq (I ⊕ J))) (h0 : pivot ∈ S)
    (hr : ∀ A ∈ S, A.rank ≤ Fintype.card I) :
    finrank ℂ S ≤ (Fintype.card I + Fintype.card J)*Fintype.card I ∧
    (finrank ℂ S = (Fintype.card I + Fintype.card J)*Fintype.card I →
      (∀ A ∈ S, pivot * A = A) ∨ (∀ A ∈ S, A * pivot = A)) := by
  classical
  let L : S →ₗ[ℝ] Sq I × Mat I J :=
    { toFun := fun a => (a.val.toBlocks₁₁, a.val.toBlocks₁₂ + a.val.toBlocks₂₁ᴴ)
      map_add' := by
        intro a b
        apply Prod.ext
        · rfl
        · change (a.val.toBlocks₁₂ + b.val.toBlocks₁₂) + (a.val.toBlocks₂₁ + b.val.toBlocks₂₁)ᴴ = (a.val.toBlocks₁₂+a.val.toBlocks₂₁ᴴ) + (b.val.toBlocks₁₂+b.val.toBlocks₂₁ᴴ)
          rw [conjTranspose_add]; abel
      map_smul' := by
        intro t a
        apply Prod.ext
        · rfl
        · change t • a.val.toBlocks₁₂ + (t • a.val.toBlocks₂₁)ᴴ = t • (_ + _)
          rw [conjTranspose_smul,star_trivial,smul_add] }
  have Hz (A : S) (ha : (L A).2 = 0) : A.val.toBlocks₁₂ = 0 ∧ A.val.toBlocks₂₁ = 0 := by
    have hb := (blocks h0 hr A.property).2
    have he : A.val.toBlocks₁₂ = -A.val.toBlocks₂₁ᴴ := eq_neg_of_add_eq_zero_left ha
    rw [he, Matrix.mul_neg, neg_eq_zero, self_mul_conjTranspose_eq_zero] at hb
    exact ⟨by simp [he,hb],hb⟩
  have hinj : Function.Injective L := by
    apply (injective_iff_map_eq_zero L).mpr
    intro a ha
    have h1 : a.val.toBlocks₁₁ = 0 := congrArg Prod.fst ha
    obtain ⟨h2,h3⟩ := Hz a (congrArg Prod.snd ha)
    apply Subtype.ext
    change a.val = 0
    rw [← fromBlocks_toBlocks a.val,h1,h2,h3,(blocks h0 hr a.property).1, fromBlocks_zero]
  have hdim : finrank ℝ (Sq I × Mat I J) = 2*((Fintype.card I+Fintype.card J)*Fintype.card I) := by
    rw [Module.finrank_prod]
    simp [Sq,Mat,Module.finrank_matrix,Complex.finrank_real_complex]; ring
  have hs : 2*finrank ℂ S = finrank ℝ S := by simpa [Complex.finrank_real_complex] using Module.finrank_mul_finrank ℝ ℂ S
  have hle := LinearMap.finrank_le_finrank_of_injective hinj
  constructor
  · omega
  intro heq
  have hsur := (LinearMap.injective_iff_surjective_of_finrank_eq_finrank (show finrank ℝ S = finrank ℝ (Sq I × Mat I J) by omega)).mp hinj
  have hPure (P : Sq I) : fromBlocks P (0 : Mat I J) 0 0 ∈ S := by
    obtain ⟨a,ha⟩ := hsur (P,0)
    have h1 : a.val.toBlocks₁₁ = P := congrArg Prod.fst ha
    obtain ⟨h2,h3⟩ := Hz a (congrArg Prod.snd ha)
    have hh := a.property
    rwa [← fromBlocks_toBlocks a.val,h1,h2,h3,(blocks h0 hr a.property).1] at hh
  have alt (A : Sq (I ⊕ J)) (ha : A ∈ S) : A.toBlocks₂₁ = 0 ∨ A.toBlocks₁₂ = 0 := by
    let P := A.toBlocks₁₁
    let Q := A.toBlocks₁₂
    let R := A.toBlocks₂₁
    have hzero (K : Sq I) (hK : IsUnit K) : R*K*Q = 0 := by
      have hmem : fromBlocks K⁻¹ Q R 0 ∈ S := by
        have hh := S.add_mem (hPure (K⁻¹-P)) ha
        rwa [← fromBlocks_toBlocks A,fromBlocks_add,zero_add,zero_add,zero_add,(blocks h0 hr ha).1,
          show K⁻¹-P+A.toBlocks₁₁ = K⁻¹ by dsimp [P]; abel] at hh
      have H := schur K⁻¹ Q R 0 (isUnit_nonsing_inv_iff.mpr hK) (hr _ hmem)
      rwa [nonsing_inv_nonsing_inv _ ((isUnit_iff_isUnit_det _).mp hK),eq_comm] at H
    have hall (K : Sq I) : R*K*Q = 0 := by
      obtain ⟨t,ht,ht'⟩ := ((regular K).and (show ∀ᶠ t : ℂ in 𝓝[≠] 0,t ≠ 0 from self_mem_nhdsWithin)).exists
      have hh := hzero _ ht
      rw [Matrix.mul_add,Matrix.mul_one,Matrix.add_mul,(blocks h0 hr ha).2,zero_add,Matrix.mul_smul,Matrix.smul_mul] at hh
      exact (smul_eq_zero.mp hh).resolve_left ht'
    change R = 0 ∨ Q = 0
    by_contra! h
    obtain ⟨i,j,hij⟩ : ∃ i j, R i j ≠ 0 := by by_contra! hh; exact h.1 (Matrix.ext hh)
    obtain ⟨k,l,hkl⟩ : ∃ k l, Q k l ≠ 0 := by by_contra! hh; exact h.2 (Matrix.ext hh)
    have hh := congrFun (congrFun (hall (Matrix.single j k 1)) i) l
    simp [Matrix.mul_apply,Matrix.single,ite_and,mul_ite,Finset.sum_ite_eq',hij,hkl] at hh
  have dich : (∀ A ∈ S, A.toBlocks₂₁ = 0) ∨ (∀ A ∈ S,A.toBlocks₁₂ = 0) := by
    by_contra! h
    obtain ⟨a,ha,ha'⟩ := h.1
    obtain ⟨b,hb,hb'⟩ := h.2
    have ha'' := (alt a ha).resolve_left ha'
    have hb'' := (alt b hb).resolve_right hb'
    have H := alt (a+b) (S.add_mem ha hb)
    change a.toBlocks₂₁ + b.toBlocks₂₁ = 0 ∨ a.toBlocks₁₂ + b.toBlocks₁₂ = 0 at H
    simp [ha'',hb'',ha',hb'] at H
  rcases dich with h | h
  · left; intro A ha
    conv => lhs; rhs; rw [← fromBlocks_toBlocks A]
    rw [← fromBlocks_toBlocks A] <;> simp [pivot,fromBlocks_multiply,h A ha,(blocks h0 hr ha).1]
  · right; intro A ha
    conv => lhs; lhs; rw [← fromBlocks_toBlocks A]
    rw [← fromBlocks_toBlocks A] <;> simp [pivot,fromBlocks_multiply,h A ha,(blocks h0 hr ha).1]

end BoundedRank

open BoundedRank
theorem problem6 (n r : ℕ) (hr : r ≤ n)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ))
    (hS : ∀ A ∈ S, A.rank ≤ r) :
    Module.finrank ℂ S ≤ n * r ∧ (Module.finrank ℂ S = n * r →
      (∃ U : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ U = r ∧
        ∀ A ∈ S, LinearMap.range A.mulVecLin ≤ U) ∨
      (∃ W : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ W = n - r ∧
        ∀ A ∈ S, W ≤ LinearMap.ker A.mulVecLin)) := by
  classical
  let P (k : ℕ) := ∃ A ∈ S, A.rank = k
  have hbase : P 0 := ⟨0,S.zero_mem,rank_zero⟩
  obtain ⟨B,hB,hmax⟩ := Nat.findGreatest_spec (P := P) (Nat.zero_le r) hbase
  have hm (A) (ha : A ∈ S) : A.rank ≤ B.rank := by
    rw [hmax]; exact Nat.le_findGreatest (hS A ha) ⟨A,ha,rfl⟩
  have hbr := hS B hB
  obtain ⟨V,U,e,hV,hU,hform⟩ := exists_rank_normal_form B
  let E := reindexRingEquiv ℂ e
  let F : Sq (Fin n) →ₗ[ℂ] Sq (Fin B.rank ⊕ Fin (Fintype.card (Fin n)-B.rank)) :=
    { toFun := fun A => E (V*A*U)
      map_add' := by intros; simp [Matrix.mul_add,Matrix.add_mul]
      map_smul' := by intros; simp [E,Matrix.mul_smul,Matrix.smul_mul]; rfl }
  have hinj : Function.Injective F := fun a b h => hV.mul_left_cancel (hU.mul_right_cancel (E.injective h))
  have hdim := (Submodule.equivMapOfInjective F hinj S).finrank_eq
  have hFB : F B = pivot := by
    change (V*B*U).submatrix e.symm e.symm = _
    rw [hform]; ext i j; simp
  have h0 : pivot ∈ S.map F := ⟨B,hB,hFB⟩
  have H := normalized (S.map F) h0 (by
    rintro _ ⟨a,ha,rfl⟩
    change ((V*a*U).submatrix e.symm e.symm).rank ≤ _
    rw [rank_submatrix,rank_mul_eq_left_of_isUnit_det U _ ((isUnit_iff_isUnit_det _).mp hU),
      rank_mul_eq_right_of_isUnit_det V _ ((isUnit_iff_isUnit_det _).mp hV)]
    simpa using hm a ha)
  simp only [Fintype.card_fin,← hdim,Nat.add_sub_cancel' (hbr.trans hr)] at H
  refine ⟨H.1.trans (Nat.mul_le_mul_left n hbr),?_⟩
  intro heq
  have he : B.rank = r := by
    by_cases hn : n = 0
    · omega
    · exact le_antisymm hbr (Nat.le_of_mul_le_mul_left (heq ▸ H.1) (Nat.pos_of_ne_zero hn))
  rcases H.2 (he ▸ heq) with h | h
  · refine Or.inl ⟨LinearMap.range B.mulVecLin,he,?_⟩
    intro A ha
    have h' := h (F A) ⟨A,ha,rfl⟩
    rw [← hFB] at h'
    have hmul : (V*B*U)*(V*A*U) = V*A*U := E.injective ((map_mul E _ _).trans h')
    have hf : B*(U*V*A) = A := hV.mul_left_cancel (hU.mul_right_cancel (by simpa only [Matrix.mul_assoc] using hmul))
    conv_lhs => rw [← hf, mulVecLin_mul]
    exact LinearMap.range_comp_le_range .. 
  · have dim := B.mulVecLin.finrank_range_add_finrank_ker
    rw [show finrank ℂ (LinearMap.range B.mulVecLin) = B.rank from rfl, he,finrank_pi,Fintype.card_fin] at dim
    refine Or.inr ⟨LinearMap.ker B.mulVecLin, by omega,?_⟩
    intro A ha
    have h' := h (F A) ⟨A,ha,rfl⟩
    rw [← hFB] at h'
    have hmul : (V*A*U)*(V*B*U) = V*A*U := E.injective ((map_mul E _ _).trans h')
    have hf : (A*U*V)*B = A := hV.mul_left_cancel (hU.mul_right_cancel (by simpa only [Matrix.mul_assoc] using hmul))
    conv_rhs => rw [← hf, mulVecLin_mul]
    exact LinearMap.ker_le_ker_comp .. 

#print axioms problem6