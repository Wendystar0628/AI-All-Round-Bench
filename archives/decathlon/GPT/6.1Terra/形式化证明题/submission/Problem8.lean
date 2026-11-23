import Mathlib.Combinatorics.Additive.ErdosGinzburgZiv
import Mathlib.Tactic

open Finset

def PlaneZeroSum (n : ℕ) : Prop :=
  ∀ (ι : Type) [DecidableEq ι] (a b : ι → ℤ) (s : Finset ι),
    4 * n - 3 ≤ s.card →
      ∃ t ⊆ s, t.card = n ∧ (n : ℤ) ∣ ∑ i ∈ t, a i ∧ (n : ℤ) ∣ ∑ i ∈ t, b i

lemma plane_zero_sum_mul (m n : ℕ) (hm : 0 < m) (hn : 0 < n)
    (hm0 : PlaneZeroSum m) (hn0 : PlaneZeroSum n) : PlaneZeroSum (m * n) := by
  classical
  intro ι inst a b s hs
  suffices ∀ k ≤ 4 * m - 3, ∃ 𝒜 : Finset (Finset ι), 𝒜.card = k ∧
      (𝒜 : Set (Finset ι)).Pairwise _root_.Disjoint ∧
        ∀ ⦃t⦄, t ∈ 𝒜 → t ⊆ s ∧ t.card = n ∧
          (n : ℤ) ∣ ∑ i ∈ t, a i ∧ (n : ℤ) ∣ ∑ i ∈ t, b i by
    obtain ⟨𝒜, hcard, hdisj, h𝒜⟩ := this _ le_rfl
    obtain ⟨ℬ, hℬ𝒜, hℬcard, hℬa, hℬb⟩ :=
      hm0 (Finset ι) (fun t => (∑ i ∈ t, a i) / n)
        (fun t => (∑ i ∈ t, b i) / n) 𝒜 (by omega)
    refine ⟨ℬ.biUnion (fun x => x), biUnion_subset.2 (fun t ht => (h𝒜 (hℬ𝒜 ht)).1), ?_, ?_, ?_⟩
    · rw [card_biUnion (hdisj.mono hℬ𝒜), sum_const_nat (fun t ht => (h𝒜 (hℬ𝒜 ht)).2.1), hℬcard]
    · rw [sum_biUnion (hdisj.mono hℬ𝒜), Int.natCast_mul, mul_comm,
        ← Int.dvd_div_iff_mul_dvd, Int.sum_div]
      · exact hℬa
      · exact fun t ht => (h𝒜 (hℬ𝒜 ht)).2.2.1
      · exact dvd_sum fun t ht => (h𝒜 (hℬ𝒜 ht)).2.2.1
    · rw [sum_biUnion (hdisj.mono hℬ𝒜), Int.natCast_mul, mul_comm,
        ← Int.dvd_div_iff_mul_dvd, Int.sum_div]
      · exact hℬb
      · exact fun t ht => (h𝒜 (hℬ𝒜 ht)).2.2.2
      · exact dvd_sum fun t ht => (h𝒜 (hℬ𝒜 ht)).2.2.2
  intro k hk
  induction k with
  | zero => exact ⟨∅, by simp⟩
  | succ k ih =>
    obtain ⟨𝒜, hcard, hdisj, h𝒜⟩ := ih (Nat.le_of_succ_le hk)
    have hremaining : 4 * n - 3 ≤ (s \ 𝒜.biUnion id).card := by
      calc
        _ ≤ (4 * m - k) * n - 3 := by gcongr; omega
        _ = (4 * (m * n) - 3) - ∑ t ∈ 𝒜, t.card := by
          rw [tsub_mul, mul_assoc, tsub_right_comm,
            sum_const_nat (fun t ht => (h𝒜 ht).2.1), hcard]
        _ ≤ s.card - (𝒜.biUnion id).card := by gcongr; exact card_biUnion_le
        _ ≤ (s \ 𝒜.biUnion id).card := le_card_sdiff ..
    obtain ⟨t₀, ht₀, ht₀card, ht₀a, ht₀b⟩ := hn0 ι a b (s \ 𝒜.biUnion id) hremaining
    have ht₀not : t₀ ∉ 𝒜 := by
      rintro h
      obtain hzero : n = 0 := by
        simpa [← card_eq_zero, ht₀card] using sdiff_disjoint.mono ht₀ (subset_biUnion_of_mem id h)
      omega
    refine ⟨𝒜.cons t₀ ht₀not, by rw [card_cons, hcard], ?_, ?_⟩
    · simp only [cons_eq_insert, coe_insert, Set.pairwise_insert_of_symm, mem_coe, ne_eq]
      exact ⟨hdisj, fun t ht _ => sdiff_disjoint.mono ht₀ (subset_biUnion_of_mem id ht)⟩
    · simp only [cons_eq_insert, mem_insert, forall_eq_or_imp, and_assoc]
      exact ⟨ht₀.trans sdiff_subset, ht₀card, ht₀a, ht₀b, h𝒜⟩

lemma plane_zero_sum_one : PlaneZeroSum 1 := by
  intro ι inst a b s hs
  have hs' : 1 ≤ s.card := by simpa using hs
  obtain ⟨t, hts, ht⟩ := exists_subset_card_eq hs'
  exact ⟨t, hts, ht, by simp, by simp⟩

lemma plane_zero_sum_of_prime_cases
    (hprime : ∀ p : ℕ, p.Prime → PlaneZeroSum p) :
    ∀ n : ℕ, 0 < n → PlaneZeroSum n := by
  intro n
  induction n using Nat.prime_composite_induction with
  | zero => intro hn; omega
  | one => intro hn; exact plane_zero_sum_one
  | prime p hp => intro hn; exact hprime p hp
  | composite m hm ihm n hn ihn =>
    intro hmn
    exact plane_zero_sum_mul m n (by omega) (by omega) (ihm (by omega)) (ihn (by omega))

lemma plane_zero_sum_statement (n : ℕ) (hn : 1 ≤ n) (h : PlaneZeroSum n)
    (f : Fin (4 * n - 3) → ZMod n × ZMod n) :
    ∃ s : Finset (Fin (4 * n - 3)),
      s.card = n ∧ ∑ i ∈ s, f i = 0 := by
  classical
  letI : NeZero n := ⟨by omega⟩
  let a : Fin (4 * n - 3) → ℤ := fun i => (f i).1.val
  let b : Fin (4 * n - 3) → ℤ := fun i => (f i).2.val
  obtain ⟨s, hs, hcard, hsa, hsb⟩ := h _ a b Finset.univ (by simp)
  refine ⟨s, hcard, ?_⟩
  have ha : ((∑ i ∈ s, a i : ℤ) : ZMod n) = 0 :=
    (ZMod.intCast_zmod_eq_zero_iff_dvd _ _).2 hsa
  have hb : ((∑ i ∈ s, b i : ℤ) : ZMod n) = 0 :=
    (ZMod.intCast_zmod_eq_zero_iff_dvd _ _).2 hsb
  have ha' : (∑ i ∈ s, (f i).1) = 0 := by
    simpa [a, Int.cast_sum, ZMod.natCast_zmod_val] using ha
  have hb' : (∑ i ∈ s, (f i).2) = 0 := by
    simpa [b, Int.cast_sum, ZMod.natCast_zmod_val] using hb
  apply Prod.ext
  · simpa only [Prod.fst_sum, Prod.fst_zero] using ha'
  · simpa only [Prod.snd_sum, Prod.snd_zero] using hb'

lemma plane_zero_sum_two : PlaneZeroSum 2 := by
  classical
  intro ι inst a b s hs
  let color : ι → ZMod 2 × ZMod 2 := fun i => (a i, b i)
  have hcard : (Finset.univ : Finset (ZMod 2 × ZMod 2)).card < s.card := by
    simp only [Finset.card_univ, Fintype.card_prod, ZMod.card]
    norm_num at hs ⊢
    omega
  obtain ⟨i, hi, j, hj, hij, heq⟩ :=
    Finset.exists_ne_map_eq_of_card_lt_of_maps_to hcard
      (f := color) (by intro x hx; exact Finset.mem_univ _)
  have ha : (2 : ℤ) ∣ a i + a j := by
    apply (ZMod.intCast_zmod_eq_zero_iff_dvd (a i + a j) 2).1
    have haeq : (a i : ZMod 2) = (a j : ZMod 2) := congrArg Prod.fst heq
    rw [Int.cast_add, haeq, ← two_mul]
    rw [show (2 : ZMod 2) = 0 from ZMod.natCast_self 2, zero_mul]
  have hb : (2 : ℤ) ∣ b i + b j := by
    apply (ZMod.intCast_zmod_eq_zero_iff_dvd (b i + b j) 2).1
    have hbeq : (b i : ZMod 2) = (b j : ZMod 2) := congrArg Prod.snd heq
    rw [Int.cast_add, hbeq, ← two_mul]
    rw [show (2 : ZMod 2) = 0 from ZMod.natCast_self 2, zero_mul]
  refine ⟨{i, j}, ?_, ?_, ?_, ?_⟩
  · intro x hx
    simp only [mem_insert, mem_singleton] at hx
    rcases hx with rfl | rfl <;> assumption
  · simp [hij]
  · simpa [hij] using ha
  · simpa [hij] using hb

lemma plane_zero_sum_pow_two (k : ℕ) : PlaneZeroSum (2 ^ k) := by
  induction k with
  | zero => simpa using plane_zero_sum_one
  | succ k ih =>
    rw [pow_succ]
    exact plane_zero_sum_mul (2 ^ k) 2 (pow_pos (by decide) _) (by decide) ih plane_zero_sum_two

open MvPolynomial

variable {ι : Type*} {p : ℕ} [Fact p.Prime]

private noncomputable def threePoly (s : Finset ι) (a b : ι → ZMod p)
    (j : Fin 3) : MvPolynomial s (ZMod p) :=
  if j = 0 then ∑ i, X i ^ (p - 1)
  else if j = 1 then ∑ i : s, a i • X i ^ (p - 1)
  else ∑ i : s, b i • X i ^ (p - 1)

private lemma threePoly_degree (s : Finset ι) (a b : ι → ZMod p) (j : Fin 3) :
    (threePoly s a b j).totalDegree ≤ p - 1 := by
  classical
  unfold threePoly
  split_ifs <;> apply totalDegree_finsetSum_le <;> intro i hi
  · exact (totalDegree_X_pow ..).le
  · exact (totalDegree_smul_le ..).trans (totalDegree_X_pow ..).le
  · exact (totalDegree_smul_le ..).trans (totalDegree_X_pow ..).le

set_option maxHeartbeats 1200000 in
lemma prime_two_dim_small_zero_sum (s : Finset ι) (a b : ι → ZMod p)
    (hs : s.card = 3 * p - 2) :
    ∃ t ⊆ s, (t.card = p ∨ t.card = 2 * p) ∧
      (∑ i ∈ t, a i) = 0 ∧ (∑ i ∈ t, b i) = 0 := by
  have : NeZero p := inferInstance
  classical
  have hdeg : (∑ j : Fin 3, (threePoly s a b j).totalDegree) < Fintype.card s := by
    have hsums : (∑ j : Fin 3, (threePoly s a b j).totalDegree) ≤ 3 * (p - 1) := by
      calc
        _ ≤ ∑ _j : Fin 3, (p - 1) := Finset.sum_le_sum fun j _ => threePoly_degree s a b j
        _ = 3 * (p - 1) := by simp
    have hp : 2 ≤ p := (Fact.out : p.Prime).two_le
    simpa only [Fintype.card_coe, hs] using (show
      (∑ j : Fin 3, (threePoly s a b j).totalDegree) < 3 * p - 2 by omega)
  letI : DecidablePred (fun x : s → ZMod p => ∀ j : Fin 3, eval x (threePoly s a b j) = 0) :=
    fun _ => Fintype.decidableForallFintype
  set N := Fintype.card {x : s → ZMod p // ∀ j, eval x (threePoly s a b j) = 0}
  let zero_sol : {x : s → ZMod p // ∀ j, eval x (threePoly s a b j) = 0} :=
    ⟨0, by intro j; fin_cases j <;>
      simp [threePoly, map_sum, (Fact.out : p.Prime).one_lt, tsub_eq_zero_iff_le]⟩
  have hNpos : 0 < N := @Fintype.card_pos _ _ ⟨zero_sol⟩
  have hpN : p ∣ N := by
    unfold N
    exact char_dvd_card_solutions_of_fintype_sum_lt p (f := threePoly s a b) hdeg
  obtain ⟨x, hx⟩ := Fintype.exists_ne_of_one_lt_card
    ((Fact.out : p.Prime).one_lt.trans_le (Nat.le_of_dvd hNpos hpN)) zero_sol
  let T : Finset s := {i | x.1 i ≠ 0}
  have hTpos : 0 < T.card := by
    apply Finset.card_pos.mpr
    rw [← Subtype.coe_ne_coe, Function.ne_iff] at hx
    exact hx.imp (fun i hi => mem_filter.2 ⟨Finset.mem_attach _ _, hi⟩)
  have hTp : p ∣ T.card := by
    rw [← CharP.cast_eq_zero_iff (ZMod p), ← Finset.sum_boole]
    simpa only [T, threePoly, if_pos, map_sum, ZMod.pow_card_sub_one, map_pow, eval_X]
      using x.2 (0 : Fin 3)
  have hTlt : T.card < 3 * p := by
    calc
      _ ≤ Fintype.card s := Finset.card_le_univ _
      _ = 3 * p - 2 := by simp [hs]
      _ < 3 * p := by have := (Fact.out : p.Prime).pos; omega
  have hTeq : T.card = p ∨ T.card = 2 * p := by
    obtain ⟨k, hk⟩ := hTp
    have hkpos : 0 < k := by
      by_contra! h
      have : k = 0 := by omega
      simp only [this, mul_zero, zero_mul] at hk
      omega
    have hklt : k < 3 := by
      by_contra! h
      have hh := Nat.mul_le_mul_left p h
      omega
    have hkcase : k = 1 ∨ k = 2 := by omega
    rcases hkcase with h | h
    · left; simpa [h] using hk
    · right; simpa [h, Nat.mul_comm] using hk
  refine ⟨T.map ⟨(↑), Subtype.val_injective⟩, ?_, ?_, ?_, ?_⟩
  · simp +contextual [subset_iff, T]
  · simpa using hTeq
  · simpa [T, threePoly, ZMod.pow_card_sub_one, Finset.sum_filter] using x.2 (1 : Fin 3)
  · simpa [T, threePoly, ZMod.pow_card_sub_one, Finset.sum_filter] using x.2 (2 : Fin 3)