import Mathlib.Basic.Complex.Basic
import Mathlib.Data.Matrix.Basis
import Mathlib.LinearAlgebra.Matrix.Rank
import Mathlib.LinearAlgebra.Matrix.Block
import Mathlib.LinearAlgebra.Matrix.Adjugate
import Mathlib.LinearAlgebra.Matrix.Charpoly.Coeff
import Mathlib.LinearAlgebra.Matrix.Trace
import Mathlib.LinearAlgebra.Dual.Lemmas
import Mathlib.Algebra.Polynomial.Roots

open Matrix Polynomial Finset

namespace Problem6Aux

/-- Any submodule contained in the union of two submodules is contained in one of them. -/
lemma submodule_le_or_le_of_forall_mem {K V : Type*} [Field K] [AddCommGroup V] [Module K V]
    {S S₁ S₂ : Submodule K V} (h : ∀ x ∈ S, x ∈ S₁ ∨ x ∈ S₂) :
    S ≤ S₁ ∨ S ≤ S₂ := by
  by_contra hnot
  push Not at hnot
  obtain ⟨h1, h2⟩ := hnot
  rw [IsConcreteLE.not_le_iff_exists] at h1 h2
  obtain ⟨x, hxS, hx1⟩ := h1
  obtain ⟨y, hyS, hy2⟩ := h2
  have hx2 : x ∈ S₂ := (h x hxS).resolve_left hx1
  have hy1 : y ∈ S₁ := (h y hyS).resolve_right hy2
  rcases h (x + y) (S.add_mem hxS hyS) with hxy1 | hxy2
  · exact hx1 (by simpa using S₁.sub_mem hxy1 hy1)
  · exact hy2 (by simpa using S₂.sub_mem hxy2 hx2)

/-- If a block diagonal matrix `fromBlocks D 0 0 E` has invertible `D` (`k × k`) and rank `≤ k`,
then `E = 0`. -/
lemma fromBlocks_diag_eq_zero_of_rank_le {k m : ℕ}
    (D : Matrix (Fin k) (Fin k) ℂ) (hD : IsUnit D.det)
    (E : Matrix (Fin m) (Fin m) ℂ)
    (hrk : (Matrix.fromBlocks D 0 0 E).rank ≤ k) : E = 0 := by
  by_contra hE
  have hex : ∃ i j, E i j ≠ 0 := by
    by_contra hall
    push Not at hall
    apply hE
    ext i j
    exact hall i j
  obtain ⟨i₀, j₀, hEij⟩ := hex
  set M := Matrix.fromBlocks D 0 0 E
  let v : Fin k ⊕ Unit → LinearMap.range M.mulVecLin := fun idx =>
    match idx with
    | Sum.inl a => ⟨M.mulVec (Pi.single (Sum.inl a) 1), ⟨Pi.single (Sum.inl a) 1, rfl⟩⟩
    | Sum.inr () => ⟨M.mulVec (Pi.single (Sum.inr j₀) 1), ⟨Pi.single (Sum.inr j₀) 1, rfl⟩⟩
  have hli : LinearIndependent ℂ v := by
    rw [Fintype.linearIndependent_iff]
    intro c hc
    have hc_val : ∑ idx : Fin k ⊕ Unit, c idx • (v idx : Fin k ⊕ Fin m → ℂ) = 0 := by
      simpa using congr_arg Subtype.val hc
    have hsplit : (∑ a : Fin k, c (Sum.inl a) • M.mulVec (Pi.single (Sum.inl a) 1)) +
        c (Sum.inr ()) • M.mulVec (Pi.single (Sum.inr j₀) 1) = 0 := by
      simpa [Fintype.sum_sum_type, v] using hc_val
    have hrow_inr : c (Sum.inr ()) * E i₀ j₀ = 0 := by
      have h := congr_fun hsplit (Sum.inr i₀)
      simp only [Pi.add_apply, Pi.smul_apply, Pi.zero_apply, Finset.sum_apply,
        smul_eq_mul, mulVec, dotProduct, Fintype.sum_sum_type, M,
        fromBlocks_apply₂₁, fromBlocks_apply₂₂, Matrix.zero_apply, Pi.single_apply] at h
      simpa using h
    have hc_unit : c (Sum.inr ()) = 0 := (mul_eq_zero.mp hrow_inr).resolve_right hEij
    rw [hc_unit, zero_smul, add_zero] at hsplit
    have hDvec : D.mulVec (fun a => c (Sum.inl a)) = 0 := by
      ext b
      have h := congr_fun hsplit (Sum.inl b)
      simp only [Pi.smul_apply, Pi.zero_apply, Finset.sum_apply, smul_eq_mul,
        mulVec, dotProduct, Fintype.sum_sum_type, M,
        fromBlocks_apply₁₁, fromBlocks_apply₁₂, Matrix.zero_apply, Pi.single_apply] at h
      simpa [mulVec, dotProduct, mul_comm] using h
    have hcinl : (fun a => c (Sum.inl a)) = 0 := by
      have h1 : D⁻¹.mulVec (D.mulVec (fun a => c (Sum.inl a))) = 0 := by
        rw [hDvec, mulVec_zero]
      rw [mulVec_mulVec, nonsing_inv_mul D hD, one_mulVec] at h1
      exact h1
    intro idx
    cases idx with
    | inl a => exact congr_fun hcinl a
    | inr u => cases u; exact hc_unit
  have hcard := hli.fintype_card_le_finrank
  simp only [Fintype.card_sum, Fintype.card_fin, Fintype.card_unit] at hcard
  change k + 1 ≤ M.rank at hcard
  omega

/-- Schur complement consequence: if `fromBlocks (t • 1 + B₁₁) B₁₂ B₂₁ B₂₂` has rank `≤ k`
whenever `t • 1 + B₁₁` is invertible, then `B₂₂ = B₂₁ * (t • 1 + B₁₁)⁻¹ * B₁₂`. -/
lemma schur_eq_zero_of_rank_le {k m : ℕ}
    (B₁₁ : Matrix (Fin k) (Fin k) ℂ) (B₁₂ : Matrix (Fin k) (Fin m) ℂ)
    (B₂₁ : Matrix (Fin m) (Fin k) ℂ) (B₂₂ : Matrix (Fin m) (Fin m) ℂ)
    (t : ℂ) (hD : IsUnit (t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁).det)
    (hrk : (Matrix.fromBlocks (t • 1 + B₁₁) B₁₂ B₂₁ B₂₂).rank ≤ k) :
    B₂₂ = B₂₁ * (t • 1 + B₁₁)⁻¹ * B₁₂ := by
  set D := t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁
  set M := Matrix.fromBlocks D B₁₂ B₂₁ B₂₂
  set L := Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 (-B₂₁ * D⁻¹) (1 : Matrix (Fin m) (Fin m) ℂ)
  set R := Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) (-D⁻¹ * B₁₂) 0 (1 : Matrix (Fin m) (Fin m) ℂ)
  have hmul : L * M * R = Matrix.fromBlocks D 0 0 (B₂₂ - B₂₁ * D⁻¹ * B₁₂) := by
    dsimp [L, M, R]
    rw [fromBlocks_multiply, fromBlocks_multiply]
    congr 1
    · simp [Matrix.one_mul, Matrix.zero_mul, Matrix.mul_zero]
    · simp only [Matrix.one_mul, Matrix.mul_one, Matrix.zero_mul, add_zero]
      rw [Matrix.neg_mul, Matrix.mul_neg, ← Matrix.mul_assoc, mul_nonsing_inv D hD,
        Matrix.one_mul, neg_add_cancel]
    · simp only [Matrix.one_mul, Matrix.mul_one, Matrix.mul_zero, add_zero]
      rw [Matrix.neg_mul, Matrix.neg_mul, Matrix.mul_assoc, nonsing_inv_mul D hD,
        Matrix.mul_one, neg_add_cancel]
    · simp only [Matrix.one_mul, Matrix.mul_one]
      have hC : -(B₂₁ * D⁻¹) * D + B₂₁ = 0 := by
        rw [Matrix.neg_mul, Matrix.mul_assoc, nonsing_inv_mul D hD, Matrix.mul_one, neg_add_cancel]
      rw [Matrix.neg_mul, hC, Matrix.zero_mul, zero_add, Matrix.neg_mul, sub_eq_add_neg, add_comm]
  have hrk2 : (Matrix.fromBlocks D 0 0 (B₂₂ - B₂₁ * D⁻¹ * B₁₂)).rank ≤ k := by
    rw [← hmul]
    exact (rank_mul_le_left _ R).trans ((rank_mul_le_right L M).trans hrk)
  have h0 := fromBlocks_diag_eq_zero_of_rank_le D hD (B₂₂ - B₂₁ * D⁻¹ * B₁₂) hrk2
  exact sub_eq_zero.mp h0

/-- Degree bound for entries of `(charmatrix (-M)).adjugate`: each entry has `natDegree ≤ k - 1`. -/
lemma charmatrix_adjugate_natDegree_le {k : ℕ} (M : Matrix (Fin k) (Fin k) ℂ) (i j : Fin k) :
    ((Matrix.charmatrix (-M)).adjugate i j).natDegree ≤ k - 1 := by
  set P : Matrix (Fin k) (Fin k) ℂ[X] := Matrix.charmatrix (-M)
  have hP_deg : ∀ a b : Fin k, (P a b).natDegree ≤ 1 := by
    intro a b
    dsimp [P, Matrix.charmatrix]
    by_cases hab : a = b
    · subst hab
      simp only [diagonal_apply_eq, RingHom.mapMatrix_apply,
        Matrix.neg_apply, map_neg, sub_neg_eq_add]
      exact (natDegree_add_le _ _).trans (max_le (by simp) (by simp))
    · simp only [diagonal_apply_ne _ hab, RingHom.mapMatrix_apply,
        Matrix.neg_apply, map_neg, zero_sub, neg_neg]
      simp
  rw [adjugate_apply, det_apply]
  refine (natDegree_sum_le _ _).trans ?_
  rw [Finset.fold_max_le]
  refine ⟨Nat.zero_le _, fun σ _ => ?_⟩
  dsimp only [Function.comp_apply]
  set Q : Matrix (Fin k) (Fin k) ℂ[X] := P.updateRow j (Pi.single i 1)
  have hsmul : ((Equiv.Perm.sign σ : ℤ) • ∏ a : Fin k, Q (σ a) a).natDegree ≤
      (∏ a : Fin k, Q (σ a) a).natDegree := by
    rcases Int.units_eq_one_or (Equiv.Perm.sign σ) with h | h
    · rw [h, Units.val_one, one_zsmul]
    · rw [h, Units.val_neg, Units.val_one, neg_one_zsmul, natDegree_neg]
  refine hsmul.trans ((natDegree_prod_le _ _).trans ?_)
  have hj_mem : σ⁻¹ j ∈ (Finset.univ : Finset (Fin k)) := Finset.mem_univ _
  rw [← Finset.add_sum_erase _ _ hj_mem]
  have h0 : (Q (σ (σ⁻¹ j)) (σ⁻¹ j)).natDegree = 0 := by
    have hσj : σ (σ⁻¹ j) = j := by simp
    rw [hσj]
    dsimp only [Q]
    rw [Matrix.updateRow_self]
    by_cases h : σ⁻¹ j = i
    · rw [h, Pi.single_eq_same, natDegree_one]
    · rw [Pi.single_eq_of_ne h, natDegree_zero]
  rw [h0, zero_add]
  calc ∑ a ∈ Finset.univ.erase (σ⁻¹ j), (Q (σ a) a).natDegree
      ≤ ∑ _ ∈ Finset.univ.erase (σ⁻¹ j), 1 := by
        refine Finset.sum_le_sum fun a ha => ?_
        have hne : σ a ≠ j := by
          intro heq
          have ha_eq : a = σ⁻¹ j := by
            rw [← heq]; simp
          exact (Finset.mem_erase.mp ha).1 ha_eq
        dsimp only [Q]
        rw [Matrix.updateRow_ne hne]
        exact hP_deg (σ a) a
    _ = k - 1 := by simp

/-- Core algebraic identities for any `B` in a rank-`≤ k` subspace containing `fromBlocks 1 0 0 0`. -/
lemma block_identities_of_rank_le {k m : ℕ} (hk : 1 ≤ k)
    (B₁₁ : Matrix (Fin k) (Fin k) ℂ) (B₁₂ : Matrix (Fin k) (Fin m) ℂ)
    (B₂₁ : Matrix (Fin m) (Fin k) ℂ) (B₂₂ : Matrix (Fin m) (Fin m) ℂ)
    (hrk : ∀ t : ℂ, (Matrix.fromBlocks (t • 1 + B₁₁) B₁₂ B₂₁ B₂₂).rank ≤ k) :
    B₂₂ = 0 ∧ B₂₁ * B₁₂ = 0 ∧ B₂₁ * B₁₁ * B₁₂ = 0 := by
  set P : Matrix (Fin k) (Fin k) ℂ[X] := Matrix.charmatrix (-B₁₁)
  have hP_eq : P = Matrix.scalar (Fin k) (X : ℂ[X]) + B₁₁.map C := by
    ext a b
    simp [P, Matrix.charmatrix, sub_eq_add_neg]
  have hdet_monic : P.det.Monic := Matrix.charpoly_monic (-B₁₁)
  have hdet_deg : P.det.natDegree = k := by
    simpa [P, Matrix.charpoly] using Matrix.charpoly_natDegree_eq_dim (-B₁₁)
  have hdet_ne : P.det ≠ 0 := hdet_monic.ne_zero
  -- Polynomial identity: P.det • B₂₂.map C = B₂₁.map C * P.adjugate * B₁₂.map C
  have hpoly_eq : P.det • B₂₂.map C = B₂₁.map C * P.adjugate * B₁₂.map C := by
    refine Matrix.ext fun i j => ?_
    set L : ℂ[X] := (P.det • B₂₂.map C) i j
    set R : ℂ[X] := (B₂₁.map C * P.adjugate * B₁₂.map C) i j
    by_contra hne
    have hsub_ne : L - R ≠ 0 := sub_ne_zero.mpr hne
    have hinf_roots : ∀ t : ℂ, P.det.eval t ≠ 0 → (L - R).eval t = 0 := by
      intro t ht
      have hevP : P.map (evalRingHom t) = t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁ := by
        ext a b
        rw [hP_eq]
        by_cases hab : a = b
        · subst hab; simp [Matrix.scalar_apply]
        · simp [Matrix.scalar_apply, diagonal_apply_ne _ hab, Matrix.one_apply_ne hab]
      have hdet_t : (t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁).det = P.det.eval t := by
        rw [← hevP]
        have := RingHom.map_det (evalRingHom t) P
        simpa using this.symm
      have hD_unit : IsUnit (t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁).det :=
        isUnit_iff_ne_zero.mpr (hdet_t ▸ ht)
      have hschur := schur_eq_zero_of_rank_le B₁₁ B₁₂ B₂₁ B₂₂ t hD_unit (hrk t)
      have hadj_mul : (t • 1 + B₁₁).det • B₂₂ = B₂₁ * (t • 1 + B₁₁).adjugate * B₁₂ := by
        have hinv : (t • 1 + B₁₁).det • (t • 1 + B₁₁)⁻¹ = (t • 1 + B₁₁).adjugate := by
          rw [Matrix.inv_def, smul_smul, Ring.mul_inverse_cancel _ hD_unit, one_smul]
        calc (t • 1 + B₁₁).det • B₂₂
            = (t • 1 + B₁₁).det • (B₂₁ * (t • 1 + B₁₁)⁻¹ * B₁₂) := by rw [hschur]
          _ = B₂₁ * ((t • 1 + B₁₁).det • (t • 1 + B₁₁)⁻¹) * B₁₂ := by
              rw [← Matrix.smul_mul, ← Matrix.mul_smul]
          _ = B₂₁ * (t • 1 + B₁₁).adjugate * B₁₂ := by rw [hinv]
      have hevL : L.eval t = ((t • 1 + B₁₁).det • B₂₂) i j := by
        dsimp [L]
        simp [hdet_t]
      have hevR : R.eval t = (B₂₁ * (t • 1 + B₁₁).adjugate * B₁₂) i j := by
        have hmap_adj : P.adjugate.map (evalRingHom t) = (t • (1 : Matrix (Fin k) (Fin k) ℂ) + B₁₁).adjugate := by
          rw [← hevP]
          exact RingHom.map_adjugate (evalRingHom t) P
        have hmap_mul : ∀ {p q s : ℕ} (X : Matrix (Fin p) (Fin q) ℂ[X]) (Y : Matrix (Fin q) (Fin s) ℂ[X]),
            (X * Y).map (evalRingHom t) = X.map (evalRingHom t) * Y.map (evalRingHom t) := by
          intro p q s X Y; ext a b
          simp [mul_apply, Polynomial.eval_finsetSum]
        have hcomp : ∀ {p q : ℕ} (X : Matrix (Fin p) (Fin q) ℂ),
            (X.map C).map (evalRingHom t) = X := by
          intro p q X; ext a b; simp
        have hall : (B₂₁.map C * P.adjugate * B₁₂.map C).map (evalRingHom t) =
            B₂₁ * (t • 1 + B₁₁).adjugate * B₁₂ := by
          rw [hmap_mul, hmap_mul, hmap_adj, hcomp, hcomp]
        have := congr_fun (congr_fun hall i) j
        simpa [R] using this
      rw [eval_sub, hevL, hevR, hadj_mul, sub_self]
    have : Infinite ℂ := Infinite.of_injective ((↑) : ℕ → ℂ) Nat.cast_injective
    have hex_t : ∃ t : ℂ, t ∉ P.det.roots.toFinset ∪ (L - R).roots.toFinset :=
      Infinite.exists_notMem_finset _
    obtain ⟨t, ht⟩ := hex_t
    rw [Finset.mem_union, Multiset.mem_toFinset, Multiset.mem_toFinset] at ht
    push Not at ht
    have ht1 : P.det.eval t ≠ 0 := fun h0 => ht.1 ((mem_roots hdet_ne).mpr h0)
    exact ht.2 ((mem_roots hsub_ne).mpr (hinf_roots t ht1))
  let A : ℕ → Matrix (Fin k) (Fin k) ℂ := fun d a b => (P.adjugate a b).coeff d
  have hA_zero : ∀ d, k ≤ d → A d = 0 := by
    intro d hd
    ext a b
    dsimp [A, P]
    apply coeff_eq_zero_of_natDegree_lt
    have := charmatrix_adjugate_natDegree_le B₁₁ a b
    omega
  have hcoeff_sandwich : ∀ d : ℕ,
      Matrix.of (fun i j => ((B₂₁.map C * P.adjugate * B₁₂.map C) i j).coeff d) = B₂₁ * A d * B₁₂ := by
    intro d
    ext i j
    simp only [of_apply, mul_apply, map_apply, finsetSum_coeff, coeff_mul_C, coeff_C_mul]
    rfl
  have hmul_adj : P * P.adjugate = P.det • (1 : Matrix (Fin k) (Fin k) ℂ[X]) :=
    Matrix.mul_adjugate P
  have hcoeff_P_adj : ∀ d : ℕ, 1 ≤ d →
      A (d - 1) + B₁₁ * A d = (P.det.coeff d) • (1 : Matrix (Fin k) (Fin k) ℂ) := by
    intro d hd
    ext a b
    have h := congr_arg (fun F : ℂ[X] => F.coeff d) (congr_fun (congr_fun hmul_adj a) b)
    have hlhs : ((P * P.adjugate) a b).coeff d = (A (d - 1) + B₁₁ * A d) a b := by
      have hsplit : P * P.adjugate = Matrix.scalar (Fin k) (X : ℂ[X]) * P.adjugate + B₁₁.map C * P.adjugate := by
        conv_lhs => arg 1; rw [hP_eq]
        rw [add_mul]
      rw [hsplit, Matrix.add_apply, coeff_add]
      have h1 : ((Matrix.scalar (Fin k) (X : ℂ[X]) * P.adjugate) a b).coeff d = A (d - 1) a b := by
        rw [scalar_apply, diagonal_mul]
        dsimp [A]
        cases d with
        | zero => omega
        | succ e => simp [coeff_X_mul]
      have h2 : ((B₁₁.map C * P.adjugate) a b).coeff d = (B₁₁ * A d) a b := by
        simp only [mul_apply, map_apply, finsetSum_coeff, coeff_C_mul]
        rfl
      rw [h1, h2, Matrix.add_apply]
    have hrhs : ((P.det • (1 : Matrix (Fin k) (Fin k) ℂ[X])) a b).coeff d =
        ((P.det.coeff d) • (1 : Matrix (Fin k) (Fin k) ℂ)) a b := by
      by_cases hab : a = b
      · subst hab; simp
      · simp [one_apply_ne hab]
    rw [hlhs, hrhs] at h
    exact h
  have hdet_top : P.det.coeff k = 1 := by
    simpa [hdet_deg] using hdet_monic.coeff_natDegree
  have hB22 : B₂₂ = 0 := by
    have hcoeff_k : (P.det.coeff k) • B₂₂ = B₂₁ * A k * B₁₂ := by
      have h1 := hcoeff_sandwich k
      rw [← hpoly_eq] at h1
      ext i j
      have h2 := congr_fun (congr_fun h1 i) j
      simpa using h2
    rw [hdet_top, one_smul, hA_zero k le_rfl, Matrix.mul_zero, Matrix.zero_mul] at hcoeff_k
    exact hcoeff_k
  have hAk1 : A (k - 1) = 1 := by
    have h := hcoeff_P_adj k hk
    rw [hA_zero k le_rfl, Matrix.mul_zero, add_zero, hdet_top, one_smul] at h
    exact h
  have hB21_B12 : B₂₁ * B₁₂ = 0 := by
    have h1 := hcoeff_sandwich (k - 1)
    rw [← hpoly_eq, hB22, hAk1, Matrix.mul_one] at h1
    ext i j
    have h2 := congr_fun (congr_fun h1 i) j
    simpa using h2.symm
  have hB21_B11_B12 : B₂₁ * B₁₁ * B₁₂ = 0 := by
    by_cases hk2 : 2 ≤ k
    · have hAk2 : A (k - 2) = (P.det.coeff (k - 1)) • 1 - B₁₁ := by
        have h := hcoeff_P_adj (k - 1) (by omega)
        have hsub : k - 1 - 1 = k - 2 := by omega
        rw [hsub, hAk1, Matrix.mul_one] at h
        exact eq_sub_of_add_eq h
      have h1 := hcoeff_sandwich (k - 2)
      rw [← hpoly_eq, hB22, hAk2] at h1
      have h0 : B₂₁ * ((P.det.coeff (k - 1)) • 1 - B₁₁) * B₁₂ = 0 := by
        ext i j
        have h2 := congr_fun (congr_fun h1 i) j
        simpa using h2.symm
      rw [Matrix.mul_sub, Matrix.sub_mul, Matrix.mul_smul, Matrix.mul_one, Matrix.smul_mul,
        hB21_B12, smul_zero, zero_sub, neg_eq_zero] at h0
      exact h0
    · have hk1 : k = 1 := by omega
      subst hk1
      have hscalar : B₁₁ = (B₁₁ 0 0) • (1 : Matrix (Fin 1) (Fin 1) ℂ) := by
        ext a b; fin_cases a; fin_cases b; simp
      rw [hscalar, Matrix.mul_smul, Matrix.mul_one, Matrix.smul_mul, hB21_B12, smul_zero]
  exact ⟨hB22, hB21_B12, hB21_B11_B12⟩

/-- Main normalized version on `Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ` containing
`fromBlocks 1 0 0 0` with every matrix of rank `≤ k`. -/
lemma problem6_normalized (k m r : ℕ) (hk : 1 ≤ k) (hkr : k ≤ r)
    (S : Submodule ℂ (Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ))
    (hA0 : Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0 ∈ S)
    (hS : ∀ B ∈ S, B.rank ≤ k) :
    Module.finrank ℂ S ≤ (k + m) * r ∧ (Module.finrank ℂ S = (k + m) * r →
      k = r ∧ ((∀ B ∈ S, B.toBlocks₂₁ = 0 ∧ B.toBlocks₂₂ = 0) ∨
      (∀ B ∈ S, B.toBlocks₁₂ = 0 ∧ B.toBlocks₂₂ = 0))) := by
  have hB_id : ∀ B ∈ S, B.toBlocks₂₂ = 0 ∧ B.toBlocks₂₁ * B.toBlocks₁₂ = 0 ∧
      B.toBlocks₂₁ * B.toBlocks₁₁ * B.toBlocks₁₂ = 0 := by
    intro B hBS
    apply block_identities_of_rank_le hk
    intro t
    have hmem : t • Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0 + B ∈ S :=
      S.add_mem (S.smul_mem t hA0) hBS
    have hblk : t • Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0 + B =
        Matrix.fromBlocks (t • 1 + B.toBlocks₁₁) B.toBlocks₁₂ B.toBlocks₂₁ B.toBlocks₂₂ := by
      conv_lhs => rw [← Matrix.fromBlocks_toBlocks B]
      rw [fromBlocks_smul, fromBlocks_add]
      simp
    rw [← hblk]
    exact hS _ hmem
  let V := Matrix (Fin k) (Fin m) ℂ × Matrix (Fin m) (Fin k) ℂ
  let π : S →ₗ[ℂ] V :=
    { toFun := fun B => (B.1.toBlocks₁₂, B.1.toBlocks₂₁)
      map_add' := fun _ _ => rfl
      map_smul' := fun _ _ => rfl }
  let ι : LinearMap.ker π →ₗ[ℂ] Matrix (Fin k) (Fin k) ℂ :=
    { toFun := fun B => B.1.1.toBlocks₁₁
      map_add' := fun _ _ => rfl
      map_smul' := fun _ _ => rfl }
  have hι_inj : Function.Injective ι := by
    intro ⟨⟨B, hBS⟩, hBker⟩ ⟨⟨C, hCS⟩, hCker⟩ hBC
    apply Subtype.ext; apply Subtype.ext
    change B = C
    rw [LinearMap.mem_ker] at hBker hCker
    have hB12 : B.toBlocks₁₂ = 0 := congr_arg Prod.fst hBker
    have hB21 : B.toBlocks₂₁ = 0 := congr_arg Prod.snd hBker
    have hC12 : C.toBlocks₁₂ = 0 := congr_arg Prod.fst hCker
    have hC21 : C.toBlocks₂₁ = 0 := congr_arg Prod.snd hCker
    have hB22 : B.toBlocks₂₂ = 0 := (hB_id B hBS).1
    have hC22 : C.toBlocks₂₂ = 0 := (hB_id C hCS).1
    have h11 : B.toBlocks₁₁ = C.toBlocks₁₁ := hBC
    rw [← Matrix.fromBlocks_toBlocks B, ← Matrix.fromBlocks_toBlocks C,
      h11, hB12, hC12, hB21, hC21, hB22, hC22]
  have hker_le : Module.finrank ℂ (LinearMap.ker π) ≤ k * k := by
    have h1 := LinearMap.finrank_le_finrank_of_injective hι_inj
    simpa [Module.finrank_matrix, Fintype.card_fin] using h1
  let Ψ : V →ₗ[ℂ] Module.Dual ℂ V :=
    { toFun := fun ⟨X, Y⟩ =>
        { toFun := fun ⟨X', Y'⟩ => (Y * X' + Y' * X).trace
          map_add' := fun ⟨X1, Y1⟩ ⟨X2, Y2⟩ => by
            change (Y * (X1 + X2) + (Y1 + Y2) * X).trace =
              (Y * X1 + Y1 * X).trace + (Y * X2 + Y2 * X).trace
            rw [Matrix.mul_add, Matrix.add_mul]
            have : Y * X1 + Y * X2 + (Y1 * X + Y2 * X) =
                (Y * X1 + Y1 * X) + (Y * X2 + Y2 * X) := by abel
            rw [this, trace_add]
          map_smul' := fun c ⟨X', Y'⟩ => by
            change (Y * (c • X') + (c • Y') * X).trace = c * (Y * X' + Y' * X).trace
            rw [Matrix.mul_smul, Matrix.smul_mul, ← smul_add, trace_smul]
            rfl }
      map_add' := fun ⟨X1, Y1⟩ ⟨X2, Y2⟩ => by
        refine LinearMap.ext fun ⟨X', Y'⟩ => ?_
        change ((Y1 + Y2) * X' + Y' * (X1 + X2)).trace =
          (Y1 * X' + Y' * X1).trace + (Y2 * X' + Y' * X2).trace
        rw [Matrix.add_mul, Matrix.mul_add]
        have : Y1 * X' + Y2 * X' + (Y' * X1 + Y' * X2) =
            (Y1 * X' + Y' * X1) + (Y2 * X' + Y' * X2) := by abel
        rw [this, trace_add]
      map_smul' := fun c ⟨X, Y⟩ => by
        refine LinearMap.ext fun ⟨X', Y'⟩ => ?_
        change ((c • Y) * X' + Y' * (c • X)).trace = c * (Y * X' + Y' * X).trace
        rw [Matrix.smul_mul, Matrix.mul_smul, ← smul_add, trace_smul]
        rfl }
  have hΨ_inj : Function.Injective Ψ := by
    rw [injective_iff_map_eq_zero]
    intro ⟨X, Y⟩ hXY
    have hX : X = 0 := by
      ext i j
      have h := LinearMap.congr_fun hXY (0, Matrix.single j i (1 : ℂ))
      change (Y * (0 : Matrix (Fin k) (Fin m) ℂ) + Matrix.single j i (1 : ℂ) * X).trace = 0 at h
      rw [Matrix.mul_zero, zero_add] at h
      have htr : (Matrix.single j i (1 : ℂ) * X).trace = X i j := by
        simp only [Matrix.trace, Matrix.diag, mul_apply, Matrix.single_apply]
        rw [Finset.sum_eq_single j]
        · rw [Finset.sum_eq_single i]
          · simp
          · intro b _ hbi; simp [hbi.symm]
          · intro hi; exact absurd (Finset.mem_univ i) hi
        · intro a _ haj
          apply Finset.sum_eq_zero; intro b _; simp [haj.symm]
        · intro hj; exact absurd (Finset.mem_univ j) hj
      exact htr ▸ h
    have hY : Y = 0 := by
      ext i j
      have h := LinearMap.congr_fun hXY (Matrix.single j i (1 : ℂ), 0)
      change (Y * Matrix.single j i (1 : ℂ) + (0 : Matrix (Fin m) (Fin k) ℂ) * X).trace = 0 at h
      rw [Matrix.zero_mul, add_zero] at h
      have htr : (Y * Matrix.single j i (1 : ℂ)).trace = Y i j := by
        simp only [Matrix.trace, Matrix.diag, mul_apply, Matrix.single_apply]
        rw [Finset.sum_eq_single i]
        · rw [Finset.sum_eq_single j]
          · simp
          · intro b _ hbj; simp [hbj.symm]
          · intro hj; exact absurd (Finset.mem_univ j) hj
        · intro a _ hai
          apply Finset.sum_eq_zero; intro b _; simp [hai.symm]
        · intro hi; exact absurd (Finset.mem_univ i) hi
      exact htr ▸ h
    exact Prod.ext hX hY
  set T : Submodule ℂ V := LinearMap.range π
  have hT_iso : T.map Ψ ≤ T.dualAnnihilator := by
    rintro _ ⟨p, hpT, rfl⟩
    rw [Submodule.mem_dualAnnihilator]
    intro q hqT
    rcases hpT with ⟨⟨B, hBS⟩, rfl⟩
    rcases hqT with ⟨⟨C, hCS⟩, rfl⟩
    have hBC := (hB_id (B + C) (S.add_mem hBS hCS)).2.1
    have hB0 := (hB_id B hBS).2.1
    have hC0 := (hB_id C hCS).2.1
    have hcross : B.toBlocks₂₁ * C.toBlocks₁₂ + C.toBlocks₂₁ * B.toBlocks₁₂ = 0 := by
      have hadd12 : (B + C).toBlocks₁₂ = B.toBlocks₁₂ + C.toBlocks₁₂ := rfl
      have hadd21 : (B + C).toBlocks₂₁ = B.toBlocks₂₁ + C.toBlocks₂₁ := rfl
      rw [hadd21, hadd12, Matrix.add_mul, Matrix.mul_add, Matrix.mul_add, hB0, hC0, zero_add,
        add_zero] at hBC
      exact hBC
    change (B.toBlocks₂₁ * C.toBlocks₁₂ + C.toBlocks₂₁ * B.toBlocks₁₂).trace = 0
    rw [hcross, trace_zero]
  have hT_le : Module.finrank ℂ T ≤ k * m := by
    have h1 : Module.finrank ℂ T = Module.finrank ℂ (T.map Ψ) :=
      (Submodule.equivMapOfInjective Ψ hΨ_inj T).finrank_eq
    have h2 : Module.finrank ℂ (T.map Ψ) ≤ Module.finrank ℂ T.dualAnnihilator :=
      Submodule.finrank_mono hT_iso
    have h3 : Module.finrank ℂ T + Module.finrank ℂ T.dualAnnihilator = Module.finrank ℂ V :=
      Subspace.finrank_add_finrank_dualAnnihilator_eq T
    have hV : Module.finrank ℂ V = 2 * (k * m) := by
      dsimp [V]
      rw [Module.finrank_prod, Module.finrank_matrix, Module.finrank_matrix,
        Fintype.card_fin, Fintype.card_fin, Module.finrank_self]
      ring
    omega
  have hrn : Module.finrank ℂ T + Module.finrank ℂ (LinearMap.ker π) = Module.finrank ℂ S :=
    LinearMap.finrank_range_add_finrank_ker π
  have hfin_le_k : Module.finrank ℂ S ≤ (k + m) * k := by
    have : k * m + k * k = (k + m) * k := by ring
    omega
  have hfin_le_r : Module.finrank ℂ S ≤ (k + m) * r :=
    hfin_le_k.trans (Nat.mul_le_mul_left (k + m) hkr)
  refine ⟨hfin_le_r, fun heq => ?_⟩
  have hkr_eq : k = r := by
    have hle : (k + m) * r ≤ (k + m) * k := heq ▸ hfin_le_k
    exact le_antisymm hkr (Nat.le_of_mul_le_mul_left hle (by omega))
  have hker_eq : Module.finrank ℂ (LinearMap.ker π) = k * k := by
    have : k * m + k * k = (k + m) * k := by ring
    rw [← hkr_eq] at heq
    omega
  have hfin_eq : Module.finrank ℂ (LinearMap.ker π) = Module.finrank ℂ (Matrix (Fin k) (Fin k) ℂ) := by
    rw [hker_eq, Module.finrank_matrix, Fintype.card_fin, Module.finrank_self, mul_one]
  have hι_surj : Function.Surjective ι := by
    rw [← LinearMap.range_eq_top]
    exact Submodule.eq_top_of_finrank_eq
      ((LinearEquiv.ofInjective ι hι_inj).finrank_eq.symm.trans hfin_eq)
  have hall_top : ∀ D : Matrix (Fin k) (Fin k) ℂ,
      Matrix.fromBlocks D (0 : Matrix (Fin k) (Fin m) ℂ) 0 0 ∈ S := by
    intro D
    obtain ⟨⟨⟨B, hBS⟩, hBker⟩, hBD⟩ := hι_surj D
    rw [LinearMap.mem_ker] at hBker
    have h12 : B.toBlocks₁₂ = 0 := congr_arg Prod.fst hBker
    have h21 : B.toBlocks₂₁ = 0 := congr_arg Prod.snd hBker
    have h22 : B.toBlocks₂₂ = 0 := (hB_id B hBS).1
    have h11 : B.toBlocks₁₁ = D := hBD
    have hBeq : B = Matrix.fromBlocks D 0 0 0 := by
      rw [← Matrix.fromBlocks_toBlocks B, h11, h12, h21, h22]
    exact hBeq ▸ hBS
  have hB_or : ∀ B ∈ S, B.toBlocks₂₁ = 0 ∨ B.toBlocks₁₂ = 0 := by
    intro B hBS
    have hB_allD : ∀ D : Matrix (Fin k) (Fin k) ℂ, B.toBlocks₂₁ * D * B.toBlocks₁₂ = 0 := by
      intro D
      set B' := B + Matrix.fromBlocks (D - B.toBlocks₁₁) 0 0 0
      have hB'S : B' ∈ S := S.add_mem hBS (hall_top (D - B.toBlocks₁₁))
      have h11 : B'.toBlocks₁₁ = D := by
        ext i j; simp [B', toBlocks₁₁]
      have h12 : B'.toBlocks₁₂ = B.toBlocks₁₂ := by
        ext i j; simp [B', toBlocks₁₂]
      have h21 : B'.toBlocks₂₁ = B.toBlocks₂₁ := by
        ext i j; simp [B', toBlocks₂₁]
      have h3 := (hB_id B' hB'S).2.2
      rwa [h11, h12, h21] at h3
    by_contra hboth
    push Not at hboth
    obtain ⟨h21_ne, h12_ne⟩ := hboth
    have hex21 : ∃ i a, B.toBlocks₂₁ i a ≠ 0 := by
      by_contra h; push Not at h; exact h21_ne (by ext i a; exact h i a)
    have hex12 : ∃ b j, B.toBlocks₁₂ b j ≠ 0 := by
      by_contra h; push Not at h; exact h12_ne (by ext b j; exact h b j)
    obtain ⟨i, a, hia⟩ := hex21
    obtain ⟨b, j, hbj⟩ := hex12
    have hprod := congr_fun (congr_fun (hB_allD (Matrix.single a b (1 : ℂ))) i) j
    have hcalc : (B.toBlocks₂₁ * Matrix.single a b (1 : ℂ) * B.toBlocks₁₂) i j =
        B.toBlocks₂₁ i a * B.toBlocks₁₂ b j := by
      simp only [mul_apply, Matrix.single_apply]
      rw [Finset.sum_eq_single b]
      · rw [Finset.sum_eq_single a]
        · simp
        · intro x _ hxa; simp [hxa.symm]
        · intro ha; exact absurd (Finset.mem_univ a) ha
      · intro y _ hyb
        have h0 : ∑ x : Fin k, B.toBlocks₂₁ i x * (if a = x ∧ b = y then (1 : ℂ) else 0) = 0 := by
          apply Finset.sum_eq_zero; intro x _; simp [hyb.symm]
        rw [h0, zero_mul]
      · intro hb; exact absurd (Finset.mem_univ b) hb
    rw [hcalc] at hprod
    exact mul_ne_zero hia hbj hprod
  let S₁ : Submodule ℂ (Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ) :=
    { carrier := {B | B.toBlocks₂₁ = 0}
      add_mem' := fun {B C} (hB : B.toBlocks₂₁ = 0) (hC : C.toBlocks₂₁ = 0) => by
        change B.toBlocks₂₁ + C.toBlocks₂₁ = 0; rw [hB, hC, add_zero]
      zero_mem' := rfl
      smul_mem' := fun c {B} (hB : B.toBlocks₂₁ = 0) => by
        change c • B.toBlocks₂₁ = 0; rw [hB, smul_zero] }
  let S₂ : Submodule ℂ (Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ) :=
    { carrier := {B | B.toBlocks₁₂ = 0}
      add_mem' := fun {B C} (hB : B.toBlocks₁₂ = 0) (hC : C.toBlocks₁₂ = 0) => by
        change B.toBlocks₁₂ + C.toBlocks₁₂ = 0; rw [hB, hC, add_zero]
      zero_mem' := rfl
      smul_mem' := fun c {B} (hB : B.toBlocks₁₂ = 0) => by
        change c • B.toBlocks₁₂ = 0; rw [hB, smul_zero] }
  refine ⟨hkr_eq, ?_⟩
  rcases submodule_le_or_le_of_forall_mem (S := S) (S₁ := S₁) (S₂ := S₂) hB_or with hle1 | hle2
  · left; exact fun B hBS => ⟨hle1 hBS, (hB_id B hBS).1⟩
  · right; exact fun B hBS => ⟨hle2 hBS, (hB_id B hBS).1⟩

end Problem6Aux

open Problem6Aux

theorem problem6 (n r : ℕ) (hr : r ≤ n)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ))
    (hS : ∀ A ∈ S, A.rank ≤ r) :
    Module.finrank ℂ S ≤ n * r ∧ (Module.finrank ℂ S = n * r →
      (∃ U : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ U = r ∧
        ∀ A ∈ S, LinearMap.range A.mulVecLin ≤ U) ∨
      (∃ W : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ W = n - r ∧
        ∀ A ∈ S, W ≤ LinearMap.ker A.mulVecLin)) := by
  classical
  by_cases hzero : ∀ A ∈ S, A.rank = 0
  · have hS_bot : S = ⊥ := by
      rw [eq_bot_iff]
      intro A hAS
      rw [Submodule.mem_bot]
      have hr0 : Module.finrank ℂ (LinearMap.range A.mulVecLin) = 0 := hzero A hAS
      have hrange_bot : LinearMap.range A.mulVecLin = ⊥ :=
        Submodule.finrank_eq_zero.mp hr0
      ext i j
      have hmem : A.mulVec (Pi.single j 1) ∈ LinearMap.range A.mulVecLin := ⟨Pi.single j 1, rfl⟩
      rw [hrange_bot, Submodule.mem_bot] at hmem
      have hi := congr_fun hmem i
      simpa [mulVec, dotProduct, Pi.single_apply] using hi
    have hfin0 : Module.finrank ℂ S = 0 := by rw [hS_bot, finrank_bot]
    refine ⟨by omega, fun heq => ?_⟩
    rw [hfin0] at heq
    have hnr : n = 0 ∨ r = 0 := mul_eq_zero.mp heq.symm
    have hr0 : r = 0 := by rcases hnr with rfl | rfl <;> omega
    left
    refine ⟨⊥, by rw [finrank_bot, hr0], fun A hAS => ?_⟩
    rw [hS_bot, Submodule.mem_bot] at hAS
    rw [hAS, mulVecLin_zero, LinearMap.range_zero]
  push Not at hzero
  set Rset : Finset ℕ := (Finset.range (r + 1)).filter (fun t => ∃ A ∈ S, A.rank = t)
  have hRset_ne : Rset.Nonempty := by
    obtain ⟨A, hAS, _⟩ := hzero
    exact ⟨A.rank, Finset.mem_filter.mpr ⟨Finset.mem_range.mpr (Nat.lt_succ_of_le (hS A hAS)), A, hAS, rfl⟩⟩
  set k := Rset.max' hRset_ne
  have hk_mem : k ∈ Rset := Finset.max'_mem Rset hRset_ne
  obtain ⟨A₀, hA₀S, hA₀_rk⟩ := (Finset.mem_filter.mp hk_mem).2
  have hS_le_k : ∀ A ∈ S, A.rank ≤ k := by
    intro A hAS
    have hmem : A.rank ∈ Rset :=
      Finset.mem_filter.mpr ⟨Finset.mem_range.mpr (Nat.lt_succ_of_le (hS A hAS)), A, hAS, rfl⟩
    exact Finset.le_max' Rset _ hmem
  have hk_le_r : k ≤ r := Nat.lt_succ_iff.mp (Finset.mem_range.mp (Finset.mem_filter.mp hk_mem).1)
  have hk_pos : 1 ≤ k := by
    obtain ⟨A, hAS, hAne⟩ := hzero
    have hle := hS_le_k A hAS
    omega
  set m := n - k
  have hkm : k + m = n := Nat.add_sub_of_le (hk_le_r.trans hr)
  have : Nonempty (Fin k ⊕ Fin m) := ⟨Sum.inl ⟨0, hk_pos⟩⟩
  set L₀ : (Fin n → ℂ) →ₗ[ℂ] (Fin n → ℂ) := A₀.mulVecLin
  have hfin_im : Module.finrank ℂ (LinearMap.range L₀) = k := hA₀_rk
  have hfin_ker : Module.finrank ℂ (LinearMap.ker L₀) = m := by
    have hrn := LinearMap.finrank_range_add_finrank_ker L₀
    rw [hfin_im, Module.finrank_fin_fun] at hrn
    omega
  let b_im : Module.Basis (Fin k) ℂ (LinearMap.range L₀) :=
    Module.finBasisOfFinrankEq ℂ _ hfin_im
  let b_ker : Module.Basis (Fin m) ℂ (LinearMap.ker L₀) :=
    Module.finBasisOfFinrankEq ℂ _ hfin_ker
  have hv_ex : ∀ i : Fin k, ∃ v : Fin n → ℂ, L₀ v = (b_im i : Fin n → ℂ) := fun i =>
    (b_im i).2
  choose v hv using hv_ex
  let domVec : Fin k ⊕ Fin m → (Fin n → ℂ) := Sum.elim v (fun j => (b_ker j : Fin n → ℂ))
  have hdom_li : LinearIndependent ℂ domVec := by
    rw [Fintype.linearIndependent_iff]
    intro c hc
    have hsplit : (∑ i : Fin k, c (Sum.inl i) • v i) +
        (∑ j : Fin m, c (Sum.inr j) • (b_ker j : Fin n → ℂ)) = 0 := by
      simpa [Fintype.sum_sum_type, domVec] using hc
    have hL := congr_arg L₀ hsplit
    rw [map_add, map_sum, map_sum, map_zero] at hL
    have hker0 : ∑ j : Fin m, L₀ (c (Sum.inr j) • (b_ker j : Fin n → ℂ)) = 0 := by
      apply Finset.sum_eq_zero
      intro j _
      rw [map_smul, LinearMap.mem_ker.mp (b_ker j).2, smul_zero]
    rw [hker0, add_zero] at hL
    have him0 : ∑ i : Fin k, c (Sum.inl i) • b_im i = 0 := by
      apply Subtype.ext
      simpa [map_smul, hv] using hL
    have hcinl : ∀ i : Fin k, c (Sum.inl i) = 0 :=
      (Fintype.linearIndependent_iff.mp b_im.linearIndependent) _ him0
    have hsum_inl0 : ∑ i : Fin k, c (Sum.inl i) • v i = 0 := by
      apply Finset.sum_eq_zero; intro i _; rw [hcinl i, zero_smul]
    rw [hsum_inl0, zero_add] at hsplit
    have hker_eq0 : ∑ j : Fin m, c (Sum.inr j) • b_ker j = 0 := by
      apply Subtype.ext
      simpa using hsplit
    have hcinr : ∀ j : Fin m, c (Sum.inr j) = 0 :=
      (Fintype.linearIndependent_iff.mp b_ker.linearIndependent) _ hker_eq0
    intro idx
    cases idx with
    | inl i => exact hcinl i
    | inr j => exact hcinr j
  let B_dom : Module.Basis (Fin k ⊕ Fin m) ℂ (Fin n → ℂ) :=
    basisOfLinearIndependentOfCardEqFinrank hdom_li (by simp [hkm])
  obtain ⟨V_comp, hcompl⟩ := Submodule.exists_isCompl (LinearMap.range L₀)
  have hfin_comp : Module.finrank ℂ V_comp = m := by
    have h := Submodule.finrank_add_eq_of_isCompl hcompl
    rw [hfin_im, Module.finrank_fin_fun] at h
    omega
  let b_comp : Module.Basis (Fin m) ℂ V_comp :=
    Module.finBasisOfFinrankEq ℂ _ hfin_comp
  let codVec : Fin k ⊕ Fin m → (Fin n → ℂ) :=
    Sum.elim (fun i => (b_im i : Fin n → ℂ)) (fun j => (b_comp j : Fin n → ℂ))
  have hcod_li : LinearIndependent ℂ codVec := by
    rw [Fintype.linearIndependent_iff]
    intro c hc
    have hsplit : (∑ i : Fin k, c (Sum.inl i) • (b_im i : Fin n → ℂ)) +
        (∑ j : Fin m, c (Sum.inr j) • (b_comp j : Fin n → ℂ)) = 0 := by
      simpa [Fintype.sum_sum_type, codVec] using hc
    set x : Fin n → ℂ := ∑ i : Fin k, c (Sum.inl i) • (b_im i : Fin n → ℂ)
    set y : Fin n → ℂ := ∑ j : Fin m, c (Sum.inr j) • (b_comp j : Fin n → ℂ)
    have hx_mem : x ∈ LinearMap.range L₀ :=
      Submodule.sum_mem _ fun i _ => Submodule.smul_mem _ _ (b_im i).2
    have hy_mem : y ∈ V_comp :=
      Submodule.sum_mem _ fun j _ => Submodule.smul_mem _ _ (b_comp j).2
    have hx0 : x = 0 := by
      have hx_comp : x ∈ V_comp := by
        have : x = -y := eq_neg_of_add_eq_zero_left hsplit
        rw [this]
        exact V_comp.neg_mem hy_mem
      exact Submodule.disjoint_def.mp hcompl.disjoint x hx_mem hx_comp
    have hy0 : y = 0 := by rw [hx0, zero_add] at hsplit; exact hsplit
    have hcinl : ∀ i : Fin k, c (Sum.inl i) = 0 :=
      (Fintype.linearIndependent_iff.mp b_im.linearIndependent) _ (Subtype.ext (by simpa [x] using hx0))
    have hcinr : ∀ j : Fin m, c (Sum.inr j) = 0 :=
      (Fintype.linearIndependent_iff.mp b_comp.linearIndependent) _ (Subtype.ext (by simpa [y] using hy0))
    intro idx
    cases idx with
    | inl i => exact hcinl i
    | inr j => exact hcinr j
  let B_cod : Module.Basis (Fin k ⊕ Fin m) ℂ (Fin n → ℂ) :=
    basisOfLinearIndependentOfCardEqFinrank hcod_li (by simp [hkm])
  let conjLin : ((Fin n → ℂ) →ₗ[ℂ] (Fin n → ℂ)) ≃ₗ[ℂ]
      ((Fin k ⊕ Fin m → ℂ) →ₗ[ℂ] (Fin k ⊕ Fin m → ℂ)) :=
    { toFun := fun f => B_cod.equivFun.toLinearMap.comp (f.comp B_dom.equivFun.symm.toLinearMap)
      invFun := fun g => B_cod.equivFun.symm.toLinearMap.comp (g.comp B_dom.equivFun.toLinearMap)
      map_add' := fun f1 f2 => LinearMap.ext fun v => by simp
      map_smul' := fun c f => LinearMap.ext fun v => by simp
      left_inv := fun f => LinearMap.ext fun v => by
        simp only [LinearMap.comp_apply, LinearEquiv.coe_coe, LinearEquiv.symm_apply_apply]
      right_inv := fun g => LinearMap.ext fun v => by
        simp only [LinearMap.comp_apply, LinearEquiv.coe_coe, LinearEquiv.apply_symm_apply] }
  let Φ : Matrix (Fin n) (Fin n) ℂ ≃ₗ[ℂ] Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ :=
    Matrix.toLin'.trans (conjLin.trans Matrix.toLin'.symm)
  have hΦ_mulVecLin : ∀ A : Matrix (Fin n) (Fin n) ℂ,
      (Φ A).mulVecLin = B_cod.equivFun.toLinearMap.comp (A.mulVecLin.comp B_dom.equivFun.symm.toLinearMap) := by
    intro A
    dsimp [Φ, conjLin]
    change Matrix.toLin' (Matrix.toLin'.symm _) = _
    rw [LinearEquiv.apply_symm_apply]
    rfl
  have hΦ_rank : ∀ A : Matrix (Fin n) (Fin n) ℂ, (Φ A).rank = A.rank := by
    intro A
    rw [Matrix.rank, Matrix.rank, hΦ_mulVecLin A]
    have h1 : LinearMap.range (B_cod.equivFun.toLinearMap.comp (A.mulVecLin.comp B_dom.equivFun.symm.toLinearMap)) =
        (LinearMap.range A.mulVecLin).map B_cod.equivFun.toLinearMap := by
      rw [LinearMap.range_comp, LinearMap.range_comp, LinearEquiv.range, Submodule.map_top]
    rw [h1, LinearEquiv.finrank_map_eq]
  have hBdom_single : ∀ idx : Fin k ⊕ Fin m, B_dom.equivFun.symm (Pi.single idx 1) = domVec idx := by
    intro idx
    have h1 : B_dom.equivFun (B_dom idx) = Pi.single idx 1 := by
      ext j; simp [Pi.single_apply, eq_comm]
    rw [← h1, LinearEquiv.symm_apply_apply]
    simp [B_dom]
  have hBcod_single : ∀ idx : Fin k ⊕ Fin m, B_cod.equivFun (codVec idx) = Pi.single idx 1 := by
    intro idx
    have h1 : codVec idx = B_cod idx := by simp [B_cod]
    rw [h1]
    ext j; simp [Pi.single_apply, eq_comm]
  have hΦ_A0 : Φ A₀ = Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0 := by
    ext i j
    have hcol : ∀ M : Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ,
        M i j = (M.mulVecLin (Pi.single j 1)) i := by
      intro M
      change M i j = ∑ a : Fin k ⊕ Fin m, M i a * (Pi.single j (1 : ℂ) : Fin k ⊕ Fin m → ℂ) a
      rw [Finset.sum_eq_single j]
      · simp
      · intro a _ haj; simp [Pi.single_eq_of_ne haj]
      · intro hj; exact absurd (Finset.mem_univ j) hj
    rw [hcol (Φ A₀), hcol (Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0), hΦ_mulVecLin A₀]
    simp only [LinearMap.comp_apply, LinearEquiv.coe_coe, hBdom_single]
    cases j with
    | inl a =>
      have hL : A₀.mulVecLin (domVec (Sum.inl a)) = codVec (Sum.inl a) := by
        dsimp [domVec, codVec]; exact hv a
      rw [hL, hBcod_single (Sum.inl a)]
      cases i with
      | inl i' => simp [mulVec, dotProduct, one_apply, Pi.single_apply, eq_comm]
      | inr i' => simp [mulVec, dotProduct, Pi.single_apply]
    | inr b =>
      have hL : A₀.mulVecLin (domVec (Sum.inr b)) = 0 := by
        dsimp [domVec]; exact LinearMap.mem_ker.mp (b_ker b).2
      rw [hL, map_zero, Pi.zero_apply]
      cases i with
      | inl i' => simp [mulVec, dotProduct]
      | inr i' => simp [mulVec, dotProduct]
  set S' : Submodule ℂ (Matrix (Fin k ⊕ Fin m) (Fin k ⊕ Fin m) ℂ) := S.map Φ.toLinearMap
  have hfin_S' : Module.finrank ℂ S' = Module.finrank ℂ S :=
    LinearEquiv.finrank_map_eq Φ S
  have hA0_mem' : Matrix.fromBlocks (1 : Matrix (Fin k) (Fin k) ℂ) 0 0 0 ∈ S' :=
    ⟨A₀, hA₀S, hΦ_A0⟩
  have hS'_rk : ∀ B ∈ S', B.rank ≤ k := by
    rintro _ ⟨A, hAS, rfl⟩
    change (Φ A).rank ≤ k
    rw [hΦ_rank A]
    exact hS_le_k A hAS
  obtain ⟨hle', heq'⟩ := problem6_normalized k m r hk_pos hk_le_r S' hA0_mem' hS'_rk
  rw [hfin_S', hkm] at hle' heq'
  refine ⟨hle', fun heq => ?_⟩
  obtain ⟨hkr_eq, hcases⟩ := heq' heq
  rcases hcases with hleft | hright
  · left
    let U' : Submodule ℂ (Fin k ⊕ Fin m → ℂ) :=
      { carrier := {x | ∀ j : Fin m, x (Sum.inr j) = 0}
        add_mem' := fun {x y} hx hy j => by simp [hx j, hy j]
        zero_mem' := fun j => rfl
        smul_mem' := fun c {x} hx j => by simp [hx j] }
    have hU'_equiv : U' ≃ₗ[ℂ] (Fin k → ℂ) :=
      { toFun := fun x i => x.1 (Sum.inl i)
        invFun := fun f => ⟨Sum.elim f 0, fun j => rfl⟩
        map_add' := fun _ _ => rfl
        map_smul' := fun _ _ => rfl
        left_inv := fun ⟨x, hx⟩ => by
          apply Subtype.ext; ext idx
          cases idx with
          | inl i => rfl
          | inr j => exact (hx j).symm
        right_inv := fun _ => rfl }
    have hU'_fin : Module.finrank ℂ U' = r := by
      rw [hU'_equiv.finrank_eq, Module.finrank_fin_fun, hkr_eq]
    refine ⟨U'.map B_cod.equivFun.symm.toLinearMap, ?_, ?_⟩
    · rw [LinearEquiv.finrank_map_eq, hU'_fin]
    · intro A hAS
      have hB := hleft (Φ A) ⟨A, hAS, rfl⟩
      rintro y ⟨x, rfl⟩
      refine ⟨B_cod.equivFun (A.mulVecLin x), ?_, by simp⟩
      intro j
      have h1 : B_cod.equivFun (A.mulVecLin x) =
          (Φ A).mulVecLin (B_dom.equivFun x) := by
        rw [hΦ_mulVecLin A]
        simp
      rw [h1]
      change ((Φ A).mulVec (B_dom.equivFun x)) (Sum.inr j) = 0
      rw [mulVec, dotProduct, Fintype.sum_sum_type]
      have hsum1 : ∑ i : Fin k, (Φ A) (Sum.inr j) (Sum.inl i) * (B_dom.equivFun x) (Sum.inl i) = 0 := by
        apply Finset.sum_eq_zero; intro i _
        have : (Φ A) (Sum.inr j) (Sum.inl i) = (Φ A).toBlocks₂₁ j i := rfl
        rw [this, hB.1, Matrix.zero_apply, zero_mul]
      have hsum2 : ∑ j' : Fin m, (Φ A) (Sum.inr j) (Sum.inr j') * (B_dom.equivFun x) (Sum.inr j') = 0 := by
        apply Finset.sum_eq_zero; intro j' _
        have : (Φ A) (Sum.inr j) (Sum.inr j') = (Φ A).toBlocks₂₂ j j' := rfl
        rw [this, hB.2, Matrix.zero_apply, zero_mul]
      rw [hsum1, hsum2, add_zero]
  · right
    let W' : Submodule ℂ (Fin k ⊕ Fin m → ℂ) :=
      { carrier := {x | ∀ i : Fin k, x (Sum.inl i) = 0}
        add_mem' := fun {x y} hx hy i => by simp [hx i, hy i]
        zero_mem' := fun i => rfl
        smul_mem' := fun c {x} hx i => by simp [hx i] }
    have hW'_equiv : W' ≃ₗ[ℂ] (Fin m → ℂ) :=
      { toFun := fun x j => x.1 (Sum.inr j)
        invFun := fun g => ⟨Sum.elim 0 g, fun i => rfl⟩
        map_add' := fun _ _ => rfl
        map_smul' := fun _ _ => rfl
        left_inv := fun ⟨x, hx⟩ => by
          apply Subtype.ext; ext idx
          cases idx with
          | inl i => exact (hx i).symm
          | inr j => rfl
        right_inv := fun _ => rfl }
    have hW'_fin : Module.finrank ℂ W' = n - r := by
      rw [hW'_equiv.finrank_eq, Module.finrank_fin_fun, ← hkr_eq]
    refine ⟨W'.map B_dom.equivFun.symm.toLinearMap, ?_, ?_⟩
    · rw [LinearEquiv.finrank_map_eq, hW'_fin]
    · intro A hAS
      have hB := hright (Φ A) ⟨A, hAS, rfl⟩
      rintro _ ⟨x, hxW', rfl⟩
      rw [LinearMap.mem_ker]
      apply B_cod.equivFun.injective
      rw [map_zero]
      change B_cod.equivFun (A.mulVecLin (B_dom.equivFun.symm x)) = 0
      have h1 : B_cod.equivFun (A.mulVecLin (B_dom.equivFun.symm x)) = (Φ A).mulVecLin x := by
        rw [hΦ_mulVecLin A]
        rfl
      rw [h1]
      ext idx
      change ((Φ A).mulVec x) idx = 0
      rw [mulVec, dotProduct, Fintype.sum_sum_type]
      have hsum1 : ∑ i : Fin k, (Φ A) idx (Sum.inl i) * x (Sum.inl i) = 0 := by
        apply Finset.sum_eq_zero; intro i _
        rw [hxW' i, mul_zero]
      have hsum2 : ∑ j : Fin m, (Φ A) idx (Sum.inr j) * x (Sum.inr j) = 0 := by
        apply Finset.sum_eq_zero; intro j _
        cases idx with
        | inl i' =>
          have : (Φ A) (Sum.inl i') (Sum.inr j) = (Φ A).toBlocks₁₂ i' j := rfl
          rw [this, hB.1, Matrix.zero_apply, zero_mul]
        | inr j' =>
          have : (Φ A) (Sum.inr j') (Sum.inr j) = (Φ A).toBlocks₂₂ j' j := rfl
          rw [this, hB.2, Matrix.zero_apply, zero_mul]
      rw [hsum1, hsum2, add_zero]
