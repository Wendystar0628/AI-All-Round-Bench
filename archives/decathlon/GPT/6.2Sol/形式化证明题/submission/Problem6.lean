import Mathlib.LinearAlgebra.Matrix.Rank
import Mathlib.LinearAlgebra.FreeModule.Finite.Matrix
import Mathlib.LinearAlgebra.Projection
import Mathlib.LinearAlgebra.Dual.Lemmas
import Mathlib.LinearAlgebra.Transvection.Basic
import Mathlib.Analysis.Complex.Basic
import Mathlib.Analysis.Normed.Module.FiniteDimension
import Mathlib.Analysis.Normed.Operator.Bilinear
import Mathlib.Analysis.Normed.Ring.Units
import Mathlib.Tactic.Module
import Mathlib.Tactic.Ring

open LinearMap Module Filter
open scoped Topology

noncomputable section

private def p6_block {U V X Y : Type*}
    [AddCommGroup U] [Module ℂ U] [AddCommGroup V] [Module ℂ V]
    [AddCommGroup X] [Module ℂ X] [AddCommGroup Y] [Module ℂ Y]
    (i : X →ₗ[ℂ] U) (o : V →ₗ[ℂ] Y) :
    (U →ₗ[ℂ] V) →ₗ[ℂ] (X →ₗ[ℂ] Y) where
  toFun A := o.comp (A.comp i)
  map_add' A B := by ext x; simp
  map_smul' c A := by ext x; simp

section Blocks

variable {E K J : Type*}
  [AddCommGroup E] [Module ℂ E] [AddCommGroup K] [Module ℂ K]
  [AddCommGroup J] [Module ℂ J]

private abbrev p6_P := p6_block (LinearMap.inl ℂ E K) (LinearMap.fst ℂ E J)
private abbrev p6_Q := p6_block (LinearMap.inr ℂ E K) (LinearMap.fst ℂ E J)
private abbrev p6_C := p6_block (LinearMap.inl ℂ E K) (LinearMap.snd ℂ E J)
private abbrev p6_D := p6_block (LinearMap.inr ℂ E K) (LinearMap.snd ℂ E J)

private def p6_base : (E × K) →ₗ[ℂ] (E × J) := LinearMap.prodMap LinearMap.id 0

private lemma p6_eval (B : (E × K) →ₗ[ℂ] E × J) (x : E) (y : K) :
    B (x,y) = (p6_P B x + p6_Q B y, p6_C B x + p6_D B y) := by
  have he : (x,y) = (x,0) + (0,y) := by simp
  calc
    B (x,y) = B ((x,0) + (0,y)) := congrArg B he
    _ = B (x,0) + B (0,y) := map_add B _ _
    _ = _ := rfl

private lemma p6_rank_schur [FiniteDimensional ℂ E] [FiniteDimensional ℂ J]
    (B : (E × K) →ₗ[ℂ] E × J)
    (hB : finrank ℂ (LinearMap.range B) ≤ finrank ℂ E)
    (m : E →ₗ[ℂ] E) (hm : ∀ x, m (p6_P B x) = x) (y : K) :
    p6_D B y = p6_C B (m (p6_Q B y)) := by
  let z := B.rangeRestrict.comp (LinearMap.inl ℂ E K)
  have hz : Function.Injective z := by
    intro a b h
    have he := congrArg (fun x : LinearMap.range B => x.val.1) h
    change p6_P B a = p6_P B b at he
    simpa [hm] using congrArg m he
  have hd := le_antisymm hB (LinearMap.finrank_le_finrank_of_injective hz)
  have hs := (LinearMap.injective_iff_surjective_of_finrank_eq_finrank hd.symm).mp hz
  obtain ⟨x, hx⟩ := hs (B.rangeRestrict (0,y))
  have hx₁ := congrArg (fun x : LinearMap.range B => x.val.1) hx
  have hx₂ := congrArg (fun x : LinearMap.range B => x.val.2) hx
  change p6_P B x = p6_Q B y at hx₁
  change p6_C B x = p6_D B y at hx₂
  rw [← hx₁, hm, hx₂]

end Blocks

section Perturbation

variable {E K J : Type*}
  [NormedAddCommGroup E] [NormedSpace ℂ E]
  [NormedAddCommGroup K] [NormedSpace ℂ K]
  [NormedAddCommGroup J] [NormedSpace ℂ J]
  [FiniteDimensional ℂ E] [FiniteDimensional ℂ K] [FiniteDimensional ℂ J]

private lemma p6_pencil (B : (E × K) →ₗ[ℂ] E × J)
    (hB : ∀ t : ℂ, finrank ℂ (LinearMap.range (p6_base + t • B)) ≤ finrank ℂ E) :
    p6_D B = 0 ∧ ∀ y, p6_C B (p6_Q B y) = 0 := by
  letI : CompleteSpace E := FiniteDimensional.complete ℂ E
  let L : ℂ → (E →L[ℂ] E) := fun t => 1 + t • (p6_P B).toContinuousLinearMap
  let M : ℂ → (E →L[ℂ] E) := Ring.inverse ∘ L
  let F := 𝓝[≠] (0 : ℂ)
  have htend : Tendsto (fun t : ℂ => t) F (𝓝 0) := tendsto_id.mono_left nhdsWithin_le_nhds
  have hL : Tendsto L F (𝓝 1) := by
    have h := (tendsto_const_nhds (x := (1 : E →L[ℂ] E))).add
      (htend.smul (tendsto_const_nhds (x := (p6_P B).toContinuousLinearMap)))
    simpa [L] using h
  have hM : Tendsto M F (𝓝 1) := by
    have h := (NormedRing.inverse_continuousAt (1 : (E →L[ℂ] E)ˣ)).tendsto.comp hL
    simpa [M, Ring.inverse_one] using h
  have hu : ∀ᶠ t in F, IsUnit (L t) :=
    hL.eventually (Units.isOpen.mem_nhds (isUnit_one : IsUnit (1 : E →L[ℂ] E)))
  have hn : ∀ᶠ t in F, t ≠ 0 := by
    exact eventually_mem_nhdsWithin
  have hP : p6_P (p6_base : (E × K) →ₗ[ℂ] E × J) = LinearMap.id := by ext x; rfl
  have hQ : p6_Q (p6_base : (E × K) →ₗ[ℂ] E × J) = 0 := by ext x; simp [p6_base, p6_block]
  have hC : p6_C (p6_base : (E × K) →ₗ[ℂ] E × J) = 0 := by ext x; rfl
  have hD : p6_D (p6_base : (E × K) →ₗ[ℂ] E × J) = 0 := by ext x; rfl
  have hSchur (y : K) : ∀ᶠ t in F, p6_D B y = t • p6_C B (M t (p6_Q B y)) := by
    filter_upwards [hu, hn] with t ht ht0
    have hPt (x : E) : p6_P (p6_base + t • B) x = L t x := by
      simp [L, map_add, map_smul, hP]
    have hinv (x : E) : (M t) (p6_P (p6_base + t • B) x) = x := by
      rw [hPt]
      change (Ring.inverse (L t) * L t) x = x
      rw [Ring.inverse_mul_cancel _ ht]
      rfl
    have he := p6_rank_schur _ (hB t) (M t).toLinearMap hinv y
    have he' : t • p6_D B y = t • (t • p6_C B (M t (p6_Q B y))) := by
      simpa [map_add, map_smul, hQ, hC, hD] using he
    have hh := congrArg (fun x : J => t⁻¹ • x) he'
    simpa only [smul_smul, ← mul_assoc, inv_mul_cancel₀ ht0, one_mul, one_smul] using hh
  have hv (y : K) : Tendsto (fun t => p6_C B (M t (p6_Q B y))) F
      (𝓝 (p6_C B (p6_Q B y))) := by
    have he := ((ContinuousLinearMap.apply ℂ E (p6_Q B y)).continuous.tendsto 1).comp hM
    have hc := (p6_C B).continuous_of_finiteDimensional.tendsto (p6_Q B y)
    exact hc.comp (by simpa [Function.comp_def] using he)
  have hd0 (y : K) : p6_D B y = 0 := by
    have ht : Tendsto (fun t : ℂ => t) F (𝓝 0) := tendsto_id.mono_left nhdsWithin_le_nhds
    have hh : Tendsto (fun t => t • p6_C B (M t (p6_Q B y))) F (𝓝 0) := by
      simpa using ht.smul (hv y)
    have hconst := hh.congr' ((hSchur y).mono fun _ ht => ht.symm)
    exact (tendsto_nhds_unique hconst tendsto_const_nhds).symm
  refine ⟨LinearMap.ext fun y => hd0 y, fun y => ?_⟩
  have he : ∀ᶠ t in F, p6_C B (M t (p6_Q B y)) = 0 := by
    filter_upwards [hSchur y, hn] with t ht ht0
    exact (smul_eq_zero.mp (ht.symm.trans (hd0 y))).resolve_left ht0
  exact tendsto_nhds_unique ((hv y).congr' he) tendsto_const_nhds

end Perturbation


private lemma p6_orbit {E J : Type*}
    [AddCommGroup E] [Module ℂ E] [AddCommGroup J] [Module ℂ J]
    (C : E →ₗ[ℂ] J) (hC : C ≠ 0) (v : E) (hv : ∀ e : E ≃ₗ[ℂ] E, C (e v) = 0) :
    v = 0 := by
  by_contra hn
  have hv₀ : C v = 0 := hv (LinearEquiv.refl ℂ E)
  obtain ⟨u, hu⟩ : ∃ u, C u ≠ 0 := by
    by_contra! hh
    exact hC (LinearMap.ext hh)
  obtain ⟨f, hf⟩ := Module.Projective.exists_dual_eq_one ℂ hn
  obtain ⟨g, hg⟩ := Module.Projective.exists_dual_eq_one ℂ hu
  let L := f - f u • (g.comp C)
  have hLu : L u = 0 := by simp [L, hg]
  have hLv : L v = 1 := by simp [L, hv₀, hf]
  have h := hv (LinearEquiv.transvection hLu)
  rw [LinearEquiv.transvection.apply, hLv, one_smul, map_add, hv₀, zero_add] at h
  exact hu h

section Normal

variable {E K J : Type*}
  [NormedAddCommGroup E] [NormedSpace ℂ E]
  [NormedAddCommGroup K] [NormedSpace ℂ K]
  [NormedAddCommGroup J] [NormedSpace ℂ J]
  [FiniteDimensional ℂ E] [FiniteDimensional ℂ K] [FiniteDimensional ℂ J]

set_option maxHeartbeats 800000 in
private lemma p6_normal
    (T : Submodule ℂ ((E × K) →ₗ[ℂ] (E × J)))
    (hbase : p6_base ∈ T)
    (hT : ∀ B ∈ T, finrank ℂ (LinearMap.range B) ≤ finrank ℂ E)
    (hKJ : finrank ℂ K = finrank ℂ J) :
    finrank ℂ T ≤ (finrank ℂ E + finrank ℂ K) * finrank ℂ E ∧
      (finrank ℂ T = (finrank ℂ E + finrank ℂ K) * finrank ℂ E →
        (∀ B ∈ T, ∀ x : E, ∀ y : K, (B (x,y)).2 = 0) ∨
        (∀ B ∈ T, ∀ y : K, B (0,y) = 0)) := by
  classical
  let P : T →ₗ[ℂ] (E →ₗ[ℂ] E) := p6_P.comp T.subtype
  let Q : T →ₗ[ℂ] (K →ₗ[ℂ] E) := p6_Q.comp T.subtype
  let C : T →ₗ[ℂ] (E →ₗ[ℂ] J) := p6_C.comp T.subtype
  have hB (B : T) : p6_D B.val = 0 ∧ ∀ y, C B (Q B y) = 0 :=
    p6_pencil B.val (fun t => hT _ (T.add_mem hbase (T.smul_mem t B.property)))
  obtain ⟨V, hV⟩ : ∃ V : Submodule ℂ E, ∀ x : E, x ∈ V ↔ ∀ B : T, C B x = 0 :=
    ⟨⨅ B : T, LinearMap.ker (C B), fun x => by simp⟩
  have hpol (A B : T) (h : C B = 0) (y : K) : C A (Q B y) = 0 := by
    have hh := (hB (A+B)).2 y
    simpa [map_add, h, (hB A).2 y] using hh
  obtain ⟨U, hU⟩ := V.exists_isCompl
  let c : T →ₗ[ℂ] (U →ₗ[ℂ] J) := (LinearMap.domRestrict' U).comp C
  have hc {A B : T} (h : c A = c B) : C A = C B := by
    ext x
    obtain ⟨⟨v,u⟩, rfl⟩ := (Submodule.prodEquivOfIsCompl V U hU).surjective x
    change C A ((v : E)+(u : E)) = C B ((v : E)+(u : E))
    rw [map_add, map_add, (hV v).mp v.property A, (hV v).mp v.property B]
    exact congrArg (fun l : U →ₗ[ℂ] J => 0 + l u) h
  obtain ⟨F, hF⟩ : ∃ F : T →ₗ[ℂ] (E →ₗ[ℂ] E) × (U →ₗ[ℂ] J), ∀ B, F B = (P B, c B) :=
    ⟨P.prod c, fun _ => rfl⟩
  have hF₀ (B : ↥(LinearMap.ker F)) : (P B.val, c B.val) = 0 :=
    (hF B.val).symm.trans (LinearMap.mem_ker.mp B.property)
  have hF₁ (B : ↥(LinearMap.ker F)) : P B.val = 0 := congrArg Prod.fst (hF₀ B)
  have hF₂ (B : ↥(LinearMap.ker F)) : C B.val = 0 := by
    apply (hc ?_).trans (map_zero C)
    rw [map_zero c]
    exact congrArg Prod.snd (hF₀ B)
  have hmem (B : ↥(LinearMap.ker F)) (y : K) : Q B.val y ∈ V := (hV _).mpr
    (fun A => hpol A B.val (hF₂ B) y)
  obtain ⟨G, hGQ⟩ : ∃ G : ↥(LinearMap.ker F) →ₗ[ℂ] (K →ₗ[ℂ] V),
      ∀ B y, (G B y : E) = Q B.val y := by
    refine ⟨{
      toFun := fun B => (Q B.val).codRestrict V (hmem B)
      map_add' := ?_
      map_smul' := ?_ }, fun _ _ => rfl⟩
    · intro B D
      ext y
      exact congrArg (fun l : K →ₗ[ℂ] E => l y) (map_add Q B.val D.val)
    · intro t B
      ext y
      exact congrArg (fun l : K →ₗ[ℂ] E => l y) (map_smul Q t B.val)
  have hG : Function.Injective G := by
    intro B D hh
    have hq (y : K) : Q B.val y = Q D.val y := by
      simpa only [hGQ] using congrArg (fun L : K →ₗ[ℂ] V => (L y : E)) hh
    apply Subtype.ext
    apply Subtype.ext
    apply LinearMap.ext
    rintro ⟨x,y⟩
    change B.val.val (x,y) = D.val.val (x,y)
    rw [p6_eval, p6_eval]
    change (P B.val x + Q B.val y, C B.val x + p6_D B.val.val y) =
      (P D.val x + Q D.val y, C D.val x + p6_D D.val.val y)
    simp [hF₁ B, hF₁ D, hF₂ B, hF₂ D, hq, (hB B.val).1, (hB D.val).1]
  have hdim₁ := Submodule.finrank_le (LinearMap.range F)
  have hdim₂ := LinearMap.finrank_le_finrank_of_injective hG
  have hdim₀ : finrank ℂ (LinearMap.range F) + finrank ℂ (LinearMap.ker F) = finrank ℂ T :=
    LinearMap.finrank_range_add_finrank_ker (K := ℂ) (V := ↥T)
      (V₂ := (E →ₗ[ℂ] E) × (↥U →ₗ[ℂ] J)) F
  have hdim : finrank ℂ ((E →ₗ[ℂ] E) × (U →ₗ[ℂ] J)) + finrank ℂ (K →ₗ[ℂ] V) =
      (finrank ℂ E + finrank ℂ K) * finrank ℂ E := by
    rw [Module.finrank_prod]
    simp only [Module.finrank_linearMap, ← hKJ]
    rw [← Submodule.finrank_add_eq_of_isCompl hU]
    ring
  constructor
  · rw [← hdim₀, ← hdim]
    exact add_le_add hdim₁ hdim₂
  intro he
  have h₁ : finrank ℂ (LinearMap.range F) = finrank ℂ ((E →ₗ[ℂ] E) × (U →ₗ[ℂ] J)) := by omega
  have h₂ : finrank ℂ (LinearMap.ker F) = finrank ℂ (K →ₗ[ℂ] V) := by omega
  have hFs : Function.Surjective F :=
    LinearMap.range_eq_top.mp (Submodule.eq_top_of_finrank_eq h₁)
  have hGs : Function.Surjective G :=
    LinearMap.range_eq_top.mp (Submodule.eq_top_of_finrank_eq
      ((LinearMap.finrank_range_of_inj hG).trans h₂))
  by_cases hall : ∀ B : T, C B = 0
  · left
    intro B hB' x y
    have h := hall ⟨B,hB'⟩
    have h' := (hB ⟨B,hB'⟩).1
    rw [p6_eval]
    change C ⟨B,hB'⟩ x + p6_D B y = 0
    simp [h,h']
  · right
    have hGoal (hQ : ∀ B : T, ∀ y, Q B y = 0) :
        ∀ B ∈ T, ∀ y : K, B (0,y) = 0 := by
      intro B hB' y
      rw [p6_eval]
      change (P ⟨B,hB'⟩ 0 + Q ⟨B,hB'⟩ y, C ⟨B,hB'⟩ 0 + p6_D B y) = 0
      simp [(hB ⟨B,hB'⟩).1, hQ]
    by_cases hK : ∀ y : K, y = 0
    · exact hGoal (fun B y => by rw [hK y, map_zero])
    push Not at hall hK
    obtain ⟨A₀, hA₀⟩ := hall
    obtain ⟨y₀, hy₀⟩ := hK
    obtain ⟨l, hl⟩ := Module.Projective.exists_dual_eq_one ℂ hy₀
    have hselect (A : T) (e : E ≃ₗ[ℂ] E) :
        ∃ B : T, P B = e.symm.toLinearMap ∧ C B = C A := by
      obtain ⟨B, h⟩ := hFs (e.symm.toLinearMap, c A)
      rw [hF] at h
      exact ⟨B, congrArg Prod.fst h, hc (congrArg Prod.snd h)⟩
    have hschur (B : T) (e : E ≃ₗ[ℂ] E) (hp : P B = e.symm.toLinearMap) (y : K) :
        C B (e (Q B y)) = 0 := by
      have hh := p6_rank_schur B.val (hT B.val B.property) e.toLinearMap
        (fun x => by change e (P B x) = x; rw [hp]; exact e.apply_symm_apply x) y
      rw [(hB B).1, LinearMap.zero_apply] at hh
      exact hh.symm
    have hVzero (v : V) : (v : E) = 0 := by
      obtain ⟨Z, hZ⟩ := hGs (l.smulRight v)
      have hZq : Q Z.val y₀ = (v : E) := by
        have hh := congrArg (fun L : K →ₗ[ℂ] V => (L y₀ : E)) hZ
        simpa [hGQ, hl] using hh
      apply p6_orbit (C A₀) hA₀
      intro e
      obtain ⟨B, hp, hC⟩ := hselect A₀ e
      have hp' : P (B+Z.val) = e.symm.toLinearMap := by rw [map_add, hp, hF₁, add_zero]
      have hC' : C (B+Z.val) = C A₀ := by rw [map_add, hC, hF₂, add_zero]
      have hh := hschur (B+Z.val) e hp' y₀
      have h := hschur B e hp y₀
      rw [hC] at h
      rw [hC', map_add Q, LinearMap.add_apply, hZq, map_add, map_add, h, zero_add] at hh
      exact hh
    have hCZ (B : T) (hC : C B = 0) (y : K) : Q B y = 0 :=
      hVzero ⟨Q B y, (hV _).mpr (fun A => hpol A B hC y)⟩
    apply hGoal
    intro A y
    by_cases hC : C A = 0
    · exact hCZ A hC y
    · apply p6_orbit (C A) hC
      intro e
      obtain ⟨B, hp, hC'⟩ := hselect A e
      let D := B + (-1 : ℂ) • A
      have hd' : C D = 0 := by
        change C (B + (-1 : ℂ) • A) = 0
        rw [map_add, map_smul, neg_one_smul, hC', add_neg_cancel]
      have hq : Q B y = Q A y := by
        have hh := hCZ D hd' y
        change Q (B + (-1 : ℂ) • A) y = 0 at hh
        rw [map_add, map_smul, neg_one_smul, LinearMap.add_apply, LinearMap.neg_apply,
          ← sub_eq_add_neg] at hh
        exact sub_eq_zero.mp hh
      have h := hschur B e hp y
      rwa [hC', hq] at h

end Normal


theorem problem6 (n r : ℕ) (hr : r ≤ n)
    (S : Submodule ℂ (Matrix (Fin n) (Fin n) ℂ))
    (hS : ∀ A ∈ S, A.rank ≤ r) :
    Module.finrank ℂ S ≤ n * r ∧ (Module.finrank ℂ S = n * r →
      (∃ U : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ U = r ∧
        ∀ A ∈ S, LinearMap.range A.mulVecLin ≤ U) ∨
      (∃ W : Submodule ℂ (Fin n → ℂ), Module.finrank ℂ W = n - r ∧
        ∀ A ∈ S, W ≤ LinearMap.ker A.mulVecLin)) := by
  classical
  let H : ℕ → Prop := fun k => ∃ A ∈ S, (A : Matrix (Fin n) (Fin n) ℂ).rank = k
  obtain ⟨A, hA, hAm⟩ : H (Nat.findGreatest H r) :=
    Nat.findGreatest_spec (Nat.zero_le r) (show H 0 from ⟨0, S.zero_mem, by simp⟩)
  have hmax (B : Matrix (Fin n) (Fin n) ℂ) (hB : B ∈ S) : B.rank ≤ A.rank := by
    rw [hAm]
    exact Nat.le_findGreatest (hS B hB) (show H B.rank from ⟨B,hB,rfl⟩)
  let K := LinearMap.ker A.mulVecLin
  let I := LinearMap.range A.mulVecLin
  obtain ⟨E, hE⟩ := K.exists_isCompl
  obtain ⟨J, hJ⟩ := I.exists_isCompl
  let e₁ := Submodule.prodEquivOfIsCompl E K hE.symm
  let A' : E →ₗ[ℂ] I := A.mulVecLin.rangeRestrict.domRestrict E
  have hinj : Function.Injective A' := by
    intro u v h
    have hv := congrArg Subtype.val h
    change A.mulVecLin (u : Fin n → ℂ) = A.mulVecLin (v : Fin n → ℂ) at hv
    apply Subtype.ext
    apply sub_eq_zero.mp
    exact Submodule.disjoint_def.mp hE.disjoint.symm _ (E.sub_mem u.property v.property)
      (LinearMap.mem_ker.mpr (by rw [map_sub, hv, sub_self]))
  have hsurj : Function.Surjective A' := by
    intro u
    obtain ⟨v, hv⟩ := u.property
    obtain ⟨⟨x,y⟩, rfl⟩ := e₁.surjective v
    refine ⟨x, Subtype.ext ?_⟩
    change A.mulVecLin (x : Fin n → ℂ) = u.val
    change A.mulVecLin ((x : Fin n → ℂ)+(y : Fin n → ℂ)) = u.val at hv
    have hy : A.mulVecLin (y : Fin n → ℂ) = 0 := LinearMap.mem_ker.mp y.property
    simpa only [map_add, hy, add_zero] using hv
  let eA := LinearEquiv.ofBijective A' ⟨hinj, hsurj⟩
  let e₂ := (eA.prodCongr (LinearEquiv.refl ℂ J)).trans (Submodule.prodEquivOfIsCompl I J hJ)
  let L := Matrix.toLin'.trans (e₁.symm.arrowCongr e₂.symm)
  let T := S.map L.toLinearMap
  have hL (B : Matrix (Fin n) (Fin n) ℂ) (x : E × K) :
      L B x = e₂.symm (B.mulVecLin (e₁ x)) := rfl
  have hbase : (p6_base : (E × K) →ₗ[ℂ] E × J) ∈ T := by
    have he : L A = p6_base := by
      apply LinearMap.ext
      rintro ⟨x,y⟩
      rw [hL]
      apply e₂.injective
      rw [e₂.apply_symm_apply]
      change A.mulVecLin ((x : Fin n → ℂ)+(y : Fin n → ℂ)) =
        ((eA x : I) : Fin n → ℂ) + ((0 : J) : Fin n → ℂ)
      have hy : A.mulVecLin (y : Fin n → ℂ) = 0 := LinearMap.mem_ker.mp y.property
      have hx : ((eA x : I) : Fin n → ℂ) = A.mulVecLin (x : Fin n → ℂ) := rfl
      rw [hx, map_add, hy, Submodule.coe_zero]
    exact Submodule.mem_map.mpr ⟨A, hA, he⟩
  have hLrank (B : Matrix (Fin n) (Fin n) ℂ) :
      finrank ℂ (LinearMap.range (L B)) = B.rank := by
    have he : LinearMap.range (L B) = (LinearMap.range B.mulVecLin).map e₂.symm.toLinearMap := by
      ext w
      simp only [LinearMap.mem_range, Submodule.mem_map, LinearEquiv.coe_coe]
      constructor
      · rintro ⟨x,rfl⟩
        exact ⟨_, ⟨e₁ x,rfl⟩, (hL B x).symm⟩
      · rintro ⟨v, ⟨u,rfl⟩,rfl⟩
        obtain ⟨x,rfl⟩ := e₁.surjective u
        exact ⟨x,hL B x⟩
    rw [he]
    exact (Submodule.equivMapOfInjective e₂.symm.toLinearMap e₂.symm.injective
      (LinearMap.range B.mulVecLin)).finrank_eq.symm
  have hEI : finrank ℂ E = finrank ℂ I := eA.finrank_eq
  have hIA : finrank ℂ I = A.rank := rfl
  have hV : finrank ℂ (Fin n → ℂ) = n := by simp
  have hEK : finrank ℂ E + finrank ℂ K = n :=
    (Submodule.finrank_add_eq_of_isCompl hE.symm).trans hV
  have hIJ : finrank ℂ I + finrank ℂ J = n :=
    (Submodule.finrank_add_eq_of_isCompl hJ).trans hV
  have hKJ : finrank ℂ K = finrank ℂ J := by omega
  have hST : finrank ℂ S = finrank ℂ T :=
    (Submodule.equivMapOfInjective L.toLinearMap L.injective S).finrank_eq
  have hT (B : (E × K) →ₗ[ℂ] E × J) (hB : B ∈ T) :
      finrank ℂ (LinearMap.range B) ≤ finrank ℂ E := by
    obtain ⟨B₀, hB₀, rfl⟩ := Submodule.mem_map.mp hB
    change finrank ℂ (LinearMap.range (L B₀)) ≤ _
    rw [hLrank, hEI, hIA]
    exact hmax _ hB₀
  obtain ⟨hle, hcase⟩ := p6_normal T hbase hT hKJ
  rw [hEK, hEI, hIA, ← hST] at hle hcase
  refine ⟨hle.trans (Nat.mul_le_mul_left _ (hS A hA)), fun he => ?_⟩
  have hAr : A.rank = r := by
    by_cases hn : n = 0
    · have h₀ := hS A hA
      omega
    · apply Nat.eq_of_mul_eq_mul_left (Nat.pos_of_ne_zero hn)
      exact le_antisymm (Nat.mul_le_mul_left _ (hS A hA)) (he ▸ hle)
  rw [hAr] at hcase
  rcases hcase he with hl | hR
  · left
    refine ⟨I, hIA.trans hAr, fun B hB => ?_⟩
    rintro w ⟨u,rfl⟩
    obtain ⟨⟨x,y⟩,rfl⟩ := e₁.surjective u
    have h := hl (L B) (Submodule.mem_map_of_mem hB) x y
    rw [hL] at h
    let z := e₂.symm (B.mulVecLin (e₁ (x,y)))
    have hz : z.2 = 0 := h
    have heq : B.mulVecLin (e₁ (x,y)) = (eA z.1 : Fin n → ℂ) := by
      calc
        _ = e₂ z := (e₂.apply_symm_apply _).symm
        _ = _ := by
          change ((eA z.1 : I) : Fin n → ℂ) + (z.2 : Fin n → ℂ) = _
          simp [hz]
    rw [heq]
    exact (eA z.1).property
  · right
    refine ⟨K, by omega, fun B hB u hu => ?_⟩
    let y : K := ⟨u,hu⟩
    have h := hR (L B) (Submodule.mem_map_of_mem hB) y
    rw [hL] at h
    have hu' : e₁ (0,y) = u := by simp [e₁, y, Submodule.coe_prodEquivOfIsCompl']
    rw [hu'] at h
    apply LinearMap.mem_ker.mpr
    exact e₂.symm.injective (h.trans e₂.symm.map_zero.symm)

#print axioms problem6
